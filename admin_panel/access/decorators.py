from functools import wraps

from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.shortcuts import redirect


def admin_required(view_func):
    @login_required
    @wraps(view_func)
    def wrapper(request, *args, **kwargs):
        if request.user.is_access_admin:
            request.show_admin_sidebar = True
            return view_func(request, *args, **kwargs)
        messages.error(request, "Admin access is required.")
        return redirect("pending_approval")

    return wrapper
