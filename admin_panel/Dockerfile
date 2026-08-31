FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["sh", "-c", "python manage.py migrate && python manage.py bootstrap_admin --email \"$ADMIN_EMAIL\" --password \"$ADMIN_PASSWORD\" --name \"$ADMIN_NAME\" && python manage.py runserver 0.0.0.0:8000"]
