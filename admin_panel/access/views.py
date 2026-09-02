from urllib.parse import urlparse

from django.conf import settings
from django.contrib import messages
from django.contrib.auth import login
from django.contrib.auth.tokens import default_token_generator
from django.contrib.auth.views import LoginView, LogoutView
from django.db.models import Count
from django.http import Http404
from django.shortcuts import get_object_or_404, redirect, render
from django.urls import reverse_lazy
from django.urls import reverse
from django.utils.encoding import force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from django.utils.encoding import force_bytes
from django.utils import timezone

from .decorators import admin_required
from .forms import AccessLoginForm, AccessRequestForm, InvitationForm, PasswordSetupForm, UserAccessForm
from .models import AccessAuditLog, AccessRequest, Invitation, User
from .tokens import create_access_token


def csrf_failure(request, reason=""):
    messages.error(request, "Security token refreshed. Please submit the form again.")
    response = redirect("login")
    response.delete_cookie(settings.CSRF_COOKIE_NAME, path="/")
    response.delete_cookie(settings.ACCESS_COOKIE_NAME, path="/")
    return response


def _safe_next_url(next_url):
    if not next_url:
        return ""
    parsed = urlparse(next_url)
    accounting = urlparse(settings.ACCOUNTING_APP_URL)
    allowed_hosts = {request_host for request_host in [accounting.netloc, "localhost:3000", "127.0.0.1:3000"] if request_host}
    if parsed.scheme in {"http", "https"} and parsed.netloc in allowed_hosts:
        return next_url
    if next_url.startswith("/") and not next_url.startswith("//"):
        return next_url
    return ""


def password_setup_path(user):
    uid = urlsafe_base64_encode(force_bytes(user.pk))
    token = default_token_generator.make_token(user)
    return reverse("setup_password", kwargs={"uidb64": uid, "token": token})


def password_setup_url(request, user):
    return request.build_absolute_uri(password_setup_path(user))


def home(request):
    if not request.user.is_authenticated:
        return redirect("login")
    if request.user.is_access_admin:
        return redirect("admin_dashboard")
    return redirect("pending_approval")


class AccessLoginView(LoginView):
    authentication_form = AccessLoginForm
    template_name = "access/login.html"

    def form_valid(self, form):
        user = form.get_user()
        user.last_login_at = timezone.now()
        user.save(update_fields=["last_login_at"])
        login(self.request, user)
        next_url = _safe_next_url(self.request.POST.get("next") or self.request.GET.get("next"))
        if user.is_access_admin:
            response = redirect("admin_dashboard")
        elif next_url:
            response = redirect(next_url)
        else:
            response = redirect(settings.ACCOUNTING_APP_URL)
        response.set_cookie(
            settings.ACCESS_COOKIE_NAME,
            create_access_token(user),
            max_age=settings.ACCESS_COOKIE_MAX_AGE,
            httponly=True,
            secure=not settings.DEBUG,
            samesite="Lax",
            path="/",
        )
        return response

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["next"] = _safe_next_url(self.request.GET.get("next"))
        context["accounting_app_url"] = settings.ACCOUNTING_APP_URL
        return context


class AccessLogoutView(LogoutView):
    next_page = reverse_lazy("login")

    def dispatch(self, request, *args, **kwargs):
        response = super().dispatch(request, *args, **kwargs)
        response.delete_cookie(settings.ACCESS_COOKIE_NAME, path="/")
        return response


def request_access(request):
    if request.method == "POST":
        form = AccessRequestForm(request.POST)
        if form.is_valid():
            form.save()
            messages.success(request, "Access request submitted.")
            return redirect("pending_approval")
    else:
        form = AccessRequestForm()
    return render(request, "access/request_access.html", {"form": form})


def _login_and_redirect_with_access_cookie(request, user, next_url=""):
    user.last_login_at = timezone.now()
    user.save(update_fields=["last_login_at"])
    login(request, user)
    response = redirect(_safe_next_url(next_url) or settings.ACCOUNTING_APP_URL)
    response.set_cookie(
        settings.ACCESS_COOKIE_NAME,
        create_access_token(user),
        max_age=settings.ACCESS_COOKIE_MAX_AGE,
        httponly=True,
        secure=not settings.DEBUG,
        samesite="Lax",
        path="/",
    )
    return response


def setup_password(request, uidb64, token):
    try:
        user_id = force_str(urlsafe_base64_decode(uidb64))
        user = User.objects.get(pk=user_id)
    except (TypeError, ValueError, OverflowError, User.DoesNotExist):
        raise Http404("Invalid password setup link.")

    if not default_token_generator.check_token(user, token):
        return render(request, "access/password_setup_invalid.html", status=400)
    if user.status in {User.Status.DISABLED, User.Status.REMOVED}:
        messages.error(request, "This account cannot set a password.")
        return redirect("login")

    form = PasswordSetupForm(user, request.POST or None)
    invitation_id = request.POST.get("invitation") or request.GET.get("invitation")
    if request.method == "POST" and form.is_valid():
        form.save()
        user.status = User.Status.ACTIVE
        user.save(update_fields=["status"])
        if invitation_id:
            invitation = Invitation.objects.filter(id=invitation_id, email=user.email, status=Invitation.Status.PENDING).first()
            if invitation:
                invitation.status = Invitation.Status.ACCEPTED
                invitation.accepted_at = timezone.now()
                invitation.save(update_fields=["status", "accepted_at"])
        AccessAuditLog.objects.create(target_user=user, target_email=user.email, action="set_password", to_role=user.role, to_status=user.status)
        return _login_and_redirect_with_access_cookie(request, user, request.POST.get("next", ""))

    return render(
        request,
        "access/setup_password.html",
        {
            "form": form,
            "target": user,
            "next": _safe_next_url(request.GET.get("next")),
            "invitation": invitation_id or "",
            "hide_admin_sidebar": True,
        },
    )


def accept_invitation(request, invitation_id):
    invitation = get_object_or_404(Invitation, pk=invitation_id)
    if invitation.status != Invitation.Status.PENDING or invitation.expires_at <= timezone.now():
        return render(request, "access/password_setup_invalid.html", {"message": "This invitation is not available."}, status=400)

    user, created = User.objects.get_or_create(
        email=invitation.email.lower(),
        defaults={
            "username": invitation.email.lower(),
            "role": invitation.role,
            "status": User.Status.PENDING,
        },
    )
    if not created:
        user.role = invitation.role
        user.status = User.Status.PENDING
        user.save(update_fields=["role", "status"])
    return redirect(f"{password_setup_path(user)}?invitation={invitation.id}")


def pending_approval(request):
    return render(request, "access/pending_approval.html")


@admin_required
def admin_dashboard(request):
    user_counts = dict(User.objects.values_list("status").annotate(count=Count("id")))
    role_counts = dict(User.objects.values_list("role").annotate(count=Count("id")))
    context = {
        "pending_requests": AccessRequest.objects.filter(status=AccessRequest.Status.PENDING)[:5],
        "recent_logs": AccessAuditLog.objects.select_related("actor", "target_user")[:8],
        "active_users": user_counts.get(User.Status.ACTIVE, 0),
        "disabled_users": user_counts.get(User.Status.DISABLED, 0),
        "admin_users": role_counts.get(User.Role.ADMIN, 0) + role_counts.get(User.Role.SUPER_ADMIN, 0),
        "pending_count": AccessRequest.objects.filter(status=AccessRequest.Status.PENDING).count(),
    }
    return render(request, "access/admin_dashboard.html", context)


@admin_required
def users(request):
    users = User.objects.order_by("email")
    setup_links = {user.id: password_setup_url(request, user) for user in users if user.status in {User.Status.PENDING, User.Status.ACTIVE} and not user.has_usable_password()}
    return render(request, "access/users.html", {"users": users, "setup_links": setup_links})


@admin_required
def edit_user(request, user_id):
    target = get_object_or_404(User, pk=user_id)
    form = UserAccessForm(request.POST or None, instance=target, actor=request.user)
    if request.method == "POST" and form.is_valid():
        before_role = target.role
        before_status = target.status
        form.save()
        AccessAuditLog.objects.create(
            actor=request.user,
            target_user=target,
            target_email=target.email,
            action="update_user_access",
            from_role=before_role,
            to_role=target.role,
            from_status=before_status,
            to_status=target.status,
        )
        messages.success(request, "User access updated.")
        return redirect("admin_users")
    return render(request, "access/edit_user.html", {"form": form, "target": target})


@admin_required
def access_requests(request):
    requests = AccessRequest.objects.select_related("reviewed_by").all()
    return render(request, "access/access_requests.html", {"requests": requests})


@admin_required
def review_access_request(request, request_id, action):
    access_request = get_object_or_404(AccessRequest, pk=request_id)
    if access_request.status != AccessRequest.Status.PENDING:
        messages.error(request, "Only pending requests can be reviewed.")
        return redirect("admin_access_requests")

    if action == "approve":
        user = access_request.approve(request.user)
        messages.success(request, f"Access request approved. Password setup link: {password_setup_url(request, user)}")
    elif action == "reject":
        access_request.reject(request.user, request.POST.get("reason", ""))
        messages.success(request, "Access request rejected.")
    return redirect("admin_access_requests")


@admin_required
def invitations(request):
    form = InvitationForm(request.POST or None)
    form.request = request
    if request.method == "POST" and form.is_valid():
        invitation = form.save(commit=False)
        invitation.email = invitation.email.lower()
        invitation.invited_by = request.user
        invitation.save()
        AccessAuditLog.objects.create(actor=request.user, target_email=invitation.email, action="create_invitation", to_role=invitation.role, to_status=invitation.status)
        messages.success(request, f"Invitation created. Accept link: {request.build_absolute_uri(reverse('accept_invitation', kwargs={'invitation_id': invitation.id}))}")
        return redirect("admin_invitations")
    invitations = Invitation.objects.select_related("invited_by")
    accept_links = {invitation.id: request.build_absolute_uri(reverse("accept_invitation", kwargs={"invitation_id": invitation.id})) for invitation in invitations if invitation.status == Invitation.Status.PENDING}
    return render(request, "access/invitations.html", {"form": form, "invitations": invitations, "accept_links": accept_links})


@admin_required
def revoke_invitation(request, invitation_id):
    invitation = get_object_or_404(Invitation, pk=invitation_id)
    if request.method == "POST":
        invitation.revoke(request.user, request.POST.get("reason", ""))
        messages.success(request, "Invitation revoked.")
    return redirect("admin_invitations")


@admin_required
def audit_logs(request):
    logs = AccessAuditLog.objects.select_related("actor", "target_user")[:200]
    return render(request, "access/audit_logs.html", {"logs": logs})
