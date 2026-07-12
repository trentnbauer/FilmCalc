# FilmCalc — static single-page app served by nginx
FROM nginx:alpine

# Remove default nginx assets
RUN rm -rf /usr/share/nginx/html/*

# Copy app files
COPY index.html /usr/share/nginx/html/index.html
COPY options.yaml /usr/share/nginx/html/options.yaml
COPY favicon.ico /usr/share/nginx/html/favicon.ico
COPY icon.ico /usr/share/nginx/html/icon.ico
COPY icon.svg /usr/share/nginx/html/icon.svg
COPY apple-touch-icon.png /usr/share/nginx/html/apple-touch-icon.png
COPY default.conf /etc/nginx/conf.d/default.conf

# Settings → Import fetches films/index.json and labs/index.json (and
# whatever preset files they list) at runtime, so these folders need to
# be served alongside the app, not just live in the git repo.
COPY films /usr/share/nginx/html/films
COPY labs /usr/share/nginx/html/labs
COPY themes /usr/share/nginx/html/themes

# docker-compose.yml mounts a named volume at exactly this path so
# config.yaml survives container recreation. That mount only works
# correctly if config.yaml already exists here as a regular file at
# build time — otherwise Docker creates the mountpoint as a directory
# instead, and the PUT endpoint below breaks. touch creates that empty
# placeholder so the (empty, on first run) named volume initializes from
# it as a file.
RUN touch /usr/share/nginx/html/config.yaml

# The nginx worker process runs as the 'nginx' user, not root — it needs write
# access to /usr/share/nginx/html for the config.yaml PUT endpoint (see
# default.conf) to work, and to /tmp/client_temp for nginx's DAV module to
# stage the request body before writing it.
RUN chown -R nginx:nginx /usr/share/nginx/html && \
    mkdir -p /tmp/client_temp && chown -R nginx:nginx /tmp/client_temp

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD wget -q -O /dev/null http://localhost/ || exit 1
