# e2b.Dockerfile.stable
# Custom E2B template optimized for FastAPI + Next.js applications

# Use Ubuntu 22.04 LTS as base for better stability
FROM ubuntu:22.04

# Set environment to avoid interactive prompts
ENV DEBIAN_FRONTEND=noninteractive
ENV LANG=C.UTF-8
ENV LC_ALL=C.UTF-8

# --- System Update and Base Dependencies ---
RUN apt-get update && apt-get install -y \
    wget \
    curl \
    software-properties-common \
    ca-certificates \
    procps \
    && rm -rf /var/lib/apt/lists/*

# --- Python 3.11 Installation ---
RUN add-apt-repository ppa:deadsnakes/ppa && \  
    apt-get update && \
    apt-get install -y \
    python3.11 \
    python3.11-dev \
    python3.11-venv \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

# Create symlinks for python3
RUN ln -sf /usr/bin/python3.11 /usr/bin/python3 && \
    ln -sf /usr/bin/python3.11 /usr/bin/python

# Upgrade pip
RUN python3 -m pip install --upgrade pip setuptools wheel

# --- Node.js 20 LTS Installation ---
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*

# --- Pre-install Common Python Packages for FastAPI ---
RUN python3 -m pip install --no-cache-dir \
    fastapi==0.104.1 \
    uvicorn[standard]==0.24.0 \
    pydantic==2.5.0 \
    requests==2.31.0 

# --- MongoDB Installation (Optional) ---
RUN wget -qO - https://www.mongodb.org/static/pgp/server-7.0.asc | apt-key add - && \
    echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | tee /etc/apt/sources.list.d/mongodb-org-7.0.list && \
    apt-get update && \
    apt-get install -y mongodb-org && \
    rm -rf /var/lib/apt/lists/*

# --- Pre-install MongoDB Python drivers ---
RUN python3 -m pip install --no-cache-dir \
    pymongo==4.6.0 

# --- Node.js Global Packages ---
RUN npm install -g \
    typescript@latest \
    @types/node@latest \
    pm2@latest \
    create-next-app@latest \
    nodemon@latest

# --- Create necessary directories ---
RUN mkdir -p /data/db && \
    mkdir -p /tmp/logs && \
    mkdir -p /home/projects

# --- Setup MongoDB data directory ---
RUN chown -R mongodb:mongodb /data/db

# --- Environment Variables ---
ENV PATH="/home/developer/.local/bin:$PATH"
ENV PYTHONPATH="/home/projects"
ENV NODE_ENV=development

# --- Final cleanup ---
RUN apt-get autoremove -y && \
    apt-get autoclean && \
    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# Set working directory
WORKDIR /home
# Set the default command
CMD ["/bin/bash"]
