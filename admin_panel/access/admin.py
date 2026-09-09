from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import (
    AccessAuditLog,
    AccessRequest,
    AccountingCompany,
    AccountingCompanyMembership,
    AccountingUser,
    AccountingUserPreference,
    Invitation,
    User,
)


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


@admin.register(AccountingCompany)
class AccountingCompanyAdmin(admin.ModelAdmin):
    list_display = ("name", "base_currency", "status", "tax_id", "created_at")
    list_filter = ("status", "base_currency")
    search_fields = ("name", "legal_name", "tax_id")


@admin.register(AccountingUser)
class AccountingUserAdmin(admin.ModelAdmin):
    list_display = ("email", "name", "company", "role", "created_at")
    search_fields = ("email", "name")


@admin.register(AccountingCompanyMembership)
class AccountingCompanyMembershipAdmin(admin.ModelAdmin):
    list_display = ("company", "user", "role", "status", "created_at")
    list_filter = ("role", "status", "company")
    search_fields = ("company__name", "user__email", "user__name")


@admin.register(AccountingUserPreference)
class AccountingUserPreferenceAdmin(admin.ModelAdmin):
    list_display = ("user", "active_company", "updated_at")
    search_fields = ("user__email", "active_company__name")
