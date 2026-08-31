from django import forms
from django.contrib.auth.forms import AuthenticationForm, SetPasswordForm

from .models import AccessRequest, Invitation, User


class AccessLoginForm(AuthenticationForm):
    username = forms.EmailField(label="Email")

    def confirm_login_allowed(self, user):
        super().confirm_login_allowed(user)
        if user.status == User.Status.PENDING:
            raise forms.ValidationError("Your account is waiting for approval.", code="pending")
        if user.status in {User.Status.DISABLED, User.Status.REMOVED}:
            raise forms.ValidationError("This account cannot access the system.", code="blocked")


class AccessRequestForm(forms.ModelForm):
    class Meta:
        model = AccessRequest
        fields = ["name", "email", "reason"]
        widgets = {"reason": forms.Textarea(attrs={"rows": 4})}

    def clean_email(self):
        email = self.cleaned_data["email"].strip().lower()
        if AccessRequest.objects.filter(email=email, status=AccessRequest.Status.PENDING).exists():
            raise forms.ValidationError("There is already a pending request for this email.")
        if User.objects.filter(email=email, status=User.Status.ACTIVE).exists():
            raise forms.ValidationError("This email already has active access.")
        return email


class InvitationForm(forms.ModelForm):
    class Meta:
        model = Invitation
        fields = ["email", "role", "expires_at"]
        widgets = {"expires_at": forms.DateTimeInput(attrs={"type": "datetime-local"})}

    def clean_role(self):
        role = self.cleaned_data["role"]
        request = getattr(self, "request", None)
        if role == User.Role.ADMIN and not request.user.is_super_admin:
            raise forms.ValidationError("Only a super admin can invite admins.")
        return role

    def clean_email(self):
        email = self.cleaned_data["email"].strip().lower()
        if Invitation.objects.filter(email=email, status=Invitation.Status.PENDING).exists():
            raise forms.ValidationError("There is already a pending invitation for this email.")
        return email


class UserAccessForm(forms.ModelForm):
    class Meta:
        model = User
        fields = ["role", "status"]

    def __init__(self, *args, actor=None, **kwargs):
        super().__init__(*args, **kwargs)
        self.actor = actor
        if actor and not actor.is_super_admin:
            self.fields["role"].choices = [(User.Role.USER, "User")]

    def clean(self):
        cleaned = super().clean()
        role = cleaned.get("role")
        status = cleaned.get("status")
        target = self.instance

        if target == self.actor and status != User.Status.ACTIVE:
            raise forms.ValidationError("You cannot disable or remove yourself.")

        if target.role == User.Role.SUPER_ADMIN:
            active_super_admins = User.objects.filter(role=User.Role.SUPER_ADMIN, status=User.Status.ACTIVE).exclude(pk=target.pk).count()
            would_remove_super = role != User.Role.SUPER_ADMIN or status != User.Status.ACTIVE
            if would_remove_super and active_super_admins == 0:
                raise forms.ValidationError("Cannot change the last active super admin.")

        if role in {User.Role.ADMIN, User.Role.SUPER_ADMIN} and not self.actor.is_super_admin:
            raise forms.ValidationError("Only a super admin can assign admin roles.")

        return cleaned


class PasswordSetupForm(SetPasswordForm):
    pass
