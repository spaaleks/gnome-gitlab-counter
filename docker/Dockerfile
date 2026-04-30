ARG FEDORA_VERSION=42
FROM fedora:${FEDORA_VERSION}

RUN dnf install -y \
        systemd \
        gnome-shell \
        gnome-extensions-app \
        gjs \
        mutter \
        dbus-daemon \
        dbus-x11 \
        xorg-x11-server-Xvfb \
        xdotool \
        ImageMagick \
        gnome-screenshot \
        sudo \
        procps-ng \
        jq \
        make \
        glib2-devel \
        python3 \
        python3-gobject \
        libsecret \
        gnome-keyring \
        google-noto-emoji-fonts \
        google-noto-sans-symbols-fonts \
        google-noto-sans-symbols2-fonts \
        && dnf clean all

# Suppress the Fedora "first run tour"
RUN rm -f /etc/xdg/autostart/org.gnome.Tour.desktop \
          /usr/share/applications/org.gnome.Tour.desktop

ARG USER_ID=1000
ARG GROUP_ID=1000
RUN groupadd -g ${GROUP_ID} dev \
    && useradd -u ${USER_ID} -g ${GROUP_ID} -m dev \
    && echo "dev ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

COPY --chown=dev:dev docker/run-test.sh /home/dev/run-test.sh
RUN chmod +x /home/dev/run-test.sh

STOPSIGNAL SIGRTMIN+3
CMD ["/sbin/init"]
