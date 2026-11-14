# موقع ثابت (HTML/CSS/JS) يُقدَّم عبر Nginx — جاهز للنشر على Coolify
FROM nginx:1.27-alpine

COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY . /usr/share/nginx/html

RUN rm -rf /usr/share/nginx/html/deploy /usr/share/nginx/html/Dockerfile \
    && chmod -R a+rX /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1/healthz || exit 1
