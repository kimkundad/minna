# Share-card pages, included by the public site's server block.
#
# Reached only by the rewrite in `location /`, which fires when the user agent
# matched the crawler map. A reader never arrives here.
#
# Each location maps one shape of the site's URL onto the API route that
# describes it. Spelling them out rather than passing the whole path to one
# route keeps the knowledge of what the site's URLs mean in the place that
# already routes them — and means an unmatched shape falls through to the
# site's own card rather than to a guess.

# A course: /th/courses/some-slug
#
# The slug is "whatever is between the slashes" rather than a character set.
# Slugs here may be Thai, which arrives percent-encoded, and nginx's PCRE is
# not in UTF mode so it cannot name those code points anyway. There is nothing
# to validate: the API looks the slug up, and an unknown one gets the site's
# own card.
location ~ "^/__og/(th|en|jp|vn)/courses/([^/]+)/?$" {
    internal;
    include /etc/nginx/conf.d/minna-og-proxy.inc;
    proxy_pass $og_upstream/og/$1/courses/$2;
}

# An article: /th/blog/some-slug
location ~ "^/__og/(th|en|jp|vn)/blog/([^/]+)/?$" {
    internal;
    include /etc/nginx/conf.d/minna-og-proxy.inc;
    proxy_pass $og_upstream/og/$1/blog/$2;
}

# Everything else under a language: the home page, the catalog, about, legal.
# The path is passed along so the card can name itself canonically.
location ~ "^/__og/(th|en|jp|vn)(/.*)?$" {
    internal;
    include /etc/nginx/conf.d/minna-og-proxy.inc;
    proxy_pass $og_upstream/og/$1/site?path=/$1$2;
}

# No language in the path at all — a bare share of the domain.
location ~ "^/__og(/.*)?$" {
    internal;
    include /etc/nginx/conf.d/minna-og-proxy.inc;
    proxy_pass $og_upstream/og/th/site?path=/th;
}
