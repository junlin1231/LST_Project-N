from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import AccessAuditLog, AccessRequest, Invitation, User


@admin.register(User)
class AccessUserAdmin(UserAdmin):
    list_display = ("email", "first_name", "role", "status", "is_staff", "last_login_at")
    list_filter = ("role", "status", "is_staff", "is_superuser")
    search_fields = ("email", "first_name", "last_name")
    ordering = ("email",)
    fieldsets = UserAdmin.fieldsets + (("Access", {"fields": ("role", "status", "last_login_at")}),)
    add_fieldsets = UserAdmin.add_fieldsets + (("Access", {"fields": ("email", "role", "status")}),)


@admin.register(AccessRequest)
class AccessRequestAdmin(admin.ModelAdmin):
    list_display = ("email", "name", "status", "requested_at", "reviewed_by", "reviewed_at")
    list_filter = ("status",)
    search_fields = ("email", "name")


@admin.register(Invitation)
class InvitationAdmin(admin.ModelAdmin):
    list_display = ("email", "role", "status", "invited_by", "expires_at", "created_at")
    list_filter = ("role", "status")
    search_fields = ("email",)


@admin.register(AccessAuditLog)
class AccessAuditLogAdmin(admin.ModelAdmin):
    list_display = ("action", "actor", "target_email", "from_role", "to_role", "from_status", "to_status", "created_at")
    list_filter = ("action", "created_at")
    search_fields = ("actor__email", "target_email", "target_user__email")
