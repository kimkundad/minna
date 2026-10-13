# The settings every share-card location needs, in one place.
#
# Resolved per request through a variable, for the same reason the API proxy
# is: nginx refuses to start when a name in an upstream does not resolve, and
# a crashed API should not take both websites down with it.

resolver 127.0.0.11 valid=10s ipv6=off;
set $og_upstream http://api:3000;

proxy_http_version 1.1;
proxy_set_header Host              $host;
proxy_set_header X-Real-IP         $remote_addr;
proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;

# A crawler waits a short time and gives up; so should this.
proxy_connect_timeout 3s;
proxy_read_timeout 8s;
