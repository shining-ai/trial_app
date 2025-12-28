FROM jrottenberg/ffmpeg:6.1-ubuntu

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
    python3 python3-pip \
 && rm -rf /var/lib/apt/lists/*

# RUN pip3 install --no-cache-dir uv

WORKDIR /app
ENTRYPOINT []
#COPY pyproject.toml uv.lock ./
#RUN uv venv && . .venv/bin/activate && uv sync

#COPY src ./src

#CMD ["uv", "run", "video-concat"]
CMD ["/bin/bash"]