# The API, included by both server blocks.
#
# In a file of its own rather than written twice, because the two copies would
# eventually disagree — and the one that fell behind would be the admin, where
# nobody would notice for a while.
#
# Not auto-loaded: nginx includes conf.d/*.conf on its own, and this is .inc so
# that it is pulled in only where it is wanted.

location /api/ {
    # Resolved per request, through a variable, rather than once at startup.
    # `proxy_pass http://api:3000` looks simpler but makes nginx refuse to
    # start while the API container is missing — so a crashed API would take
    # both websites down with it, and a `docker compose rm api` would leave
    # nothing able to come back up. This way nginx serves the sites and
    # returns 502 for the API alone, and recovers on its own when it returns.
    resolver 127.0.0.11 valid=10s ipv6=off;
    set $api_upstream http://api:3000;
    proxy_pass $api_upstream$request_uri;
    proxy_http_version 1.1;

    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    # The API builds absolute links (password resets, Stripe return URLs) and
    # sets `secure` cookies. Without this it sees plain http from the proxy
    # and would mark them insecure.
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-Host  $host;

    # Server-sent events: chat and the payment-waiting page both hold a
    # connection open and read it as it arrives. Buffering would collect the
    # whole stream and deliver nothing until it ended, which for a stream that
    # never ends means delivering nothing at all.
    proxy_buffering off;
    proxy_cache off;
    proxy_set_header Connection "";
    # Long enough for an idle SSE connection to survive between messages.
    proxy_read_timeout 1h;
    proxy_send_timeout 1h;
}

# Outside /api on purpose — it is the container's own health, not part of the
# public interface. Left reachable so the host's proxy can watch it too.
location = /health {
    resolver 127.0.0.11 valid=10s ipv6=off;
    set $api_health http://api:3000;
    proxy_pass $api_health/health;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    access_log off;
}
