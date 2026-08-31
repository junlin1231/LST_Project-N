from django.core.management.base import BaseCommand

from access.models import User


class Command(BaseCommand):
    help = "Create or update the first super admin account."

    def add_arguments(self, parser):
        parser.add_argument("--email", required=True)
        parser.add_argument("--password", required=True)
        parser.add_argument("--name", default="Super Admin")

    def handle(self, *args, **options):
        email = options["email"].strip().lower()
        user, created = User.objects.get_or_create(
            email=email,
            defaults={
                "username": email,
                "first_name": options["name"],
                "role": User.Role.SUPER_ADMIN,
                "status": User.Status.ACTIVE,
                "is_staff": True,
                "is_superuser": True,
            },
        )
        user.username = user.username or email
        user.email = email
        user.first_name = options["name"]
        user.role = User.Role.SUPER_ADMIN
        user.status = User.Status.ACTIVE
        user.is_staff = True
        user.is_superuser = True
        user.set_password(options["password"])
        user.save()
        action = "Created" if created else "Updated"
        self.stdout.write(self.style.SUCCESS(f"{action} super admin {email}"))
