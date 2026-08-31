from django.conf import settings
from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils import timezone


class User(AbstractUser):
    class Role(models.TextChoices):
        SUPER_ADMIN = "super_admin", "Super Admin"
        ADMIN = "admin", "Admin"
        USER = "user", "User"

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        ACTIVE = "active", "Active"
        DISABLED = "disabled", "Disabled"
        REMOVED = "removed", "Removed"

    email = models.EmailField(unique=True)
    role = models.CharField(max_length=32, choices=Role.choices, default=Role.USER)
    status = models.CharField(max_length=32, choices=Status.choices, default=Status.PENDING)
    last_login_at = models.DateTimeField(null=True, blank=True)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["username"]

    @property
    def is_access_admin(self):
        return self.status == self.Status.ACTIVE and self.role in {self.Role.ADMIN, self.Role.SUPER_ADMIN}

    @property
    def is_super_admin(self):
        return self.status == self.Status.ACTIVE and self.role == self.Role.SUPER_ADMIN


class AccessRequest(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"

    name = models.CharField(max_length=255)
    email = models.EmailField()
    reason = models.TextField(blank=True)
    status = models.CharField(max_length=32, choices=Status.choices, default=Status.PENDING)
    reviewed_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="reviewed_access_requests")
    review_reason = models.TextField(blank=True)
    requested_at = models.DateTimeField(auto_now_add=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-requested_at"]
        constraints = [
            models.UniqueConstraint(fields=["email", "status"], condition=models.Q(status="pending"), name="unique_pending_access_request_email"),
        ]

    def approve(self, actor):
        user, _ = User.objects.update_or_create(
            email=self.email.lower(),
            defaults={
                "username": self.email.lower(),
                "first_name": self.name,
                "role": User.Role.USER,
                "status": User.Status.ACTIVE,
            },
        )
        if not user.has_usable_password():
            user.set_unusable_password()
            user.save(update_fields=["password"])
        self.status = self.Status.APPROVED
        self.reviewed_by = actor
        self.reviewed_at = timezone.now()
        self.save(update_fields=["status", "reviewed_by", "reviewed_at"])
        AccessAuditLog.objects.create(actor=actor, target_user=user, target_email=self.email, action="approve_request", to_role=user.role, to_status=user.status)
        return user

    def reject(self, actor, reason=""):
        self.status = self.Status.REJECTED
        self.reviewed_by = actor
        self.review_reason = reason
        self.reviewed_at = timezone.now()
        self.save(update_fields=["status", "reviewed_by", "review_reason", "reviewed_at"])
        AccessAuditLog.objects.create(actor=actor, target_email=self.email, action="reject_request", reason=reason)


class Invitation(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        ACCEPTED = "accepted", "Accepted"
        REVOKED = "revoked", "Revoked"
        EXPIRED = "expired", "Expired"

    email = models.EmailField()
    role = models.CharField(max_length=32, choices=[(User.Role.ADMIN, "Admin"), (User.Role.USER, "User")], default=User.Role.USER)
    status = models.CharField(max_length=32, choices=Status.choices, default=Status.PENDING)
    invited_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="sent_invitations")
    expires_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)
    accepted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(fields=["email", "status"], condition=models.Q(status="pending"), name="unique_pending_invitation_email"),
        ]

    def revoke(self, actor, reason=""):
        self.status = self.Status.REVOKED
        self.save(update_fields=["status"])
        AccessAuditLog.objects.create(actor=actor, target_email=self.email, action="revoke_invitation", to_role=self.role, reason=reason)


class AccessAuditLog(models.Model):
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="access_audit_actions")
    target_user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="access_audit_targets")
    target_email = models.EmailField(blank=True)
    action = models.CharField(max_length=100)
    from_role = models.CharField(max_length=32, blank=True)
    to_role = models.CharField(max_length=32, blank=True)
    from_status = models.CharField(max_length=32, blank=True)
    to_status = models.CharField(max_length=32, blank=True)
    reason = models.TextField(blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
