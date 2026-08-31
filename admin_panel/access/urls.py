from django.urls import path

from . import views

urlpatterns = [
    path("", views.home, name="home"),
    path("login/", views.AccessLoginView.as_view(), name="login"),
    path("logout/", views.AccessLogoutView.as_view(), name="logout"),
    path("request-access/", views.request_access, name="request_access"),
    path("pending-approval/", views.pending_approval, name="pending_approval"),
    path("setup-password/<str:uidb64>/<str:token>/", views.setup_password, name="setup_password"),
    path("accept-invitation/<int:invitation_id>/", views.accept_invitation, name="accept_invitation"),
    path("admin-panel/", views.admin_dashboard, name="admin_dashboard"),
    path("admin-panel/users/", views.users, name="admin_users"),
    path("admin-panel/users/<int:user_id>/", views.edit_user, name="admin_edit_user"),
    path("admin-panel/access-requests/", views.access_requests, name="admin_access_requests"),
    path("admin-panel/access-requests/<int:request_id>/<str:action>/", views.review_access_request, name="admin_review_access_request"),
    path("admin-panel/invitations/", views.invitations, name="admin_invitations"),
    path("admin-panel/invitations/<int:invitation_id>/revoke/", views.revoke_invitation, name="admin_revoke_invitation"),
    path("admin-panel/audit-logs/", views.audit_logs, name="admin_audit_logs"),
]
