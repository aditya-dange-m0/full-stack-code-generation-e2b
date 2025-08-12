# e2b.Dockerfile

# Use a modern, stable base image. Ubuntu 22.04 is an excellent choice for web servers.
FROM ubuntu:22.04

# Set environment variables to prevent interactive prompts during installation
ENV DEBIAN_FRONTEND=noninteractive
# Add the Node.js global bin directory to the path for tools like pm2
ENV PATH="/usr/local/bin:${PATH}"

# 1. INSTALL SYSTEM DEPENDENCIES & CORE RUNTIMES
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    git \
    unzip \
    build-essential \
    python3.11 \
    python3-pip

# 2. CONFIGURE NODE.JS ENVIRONMENT (using NodeSource for a modern version)
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
RUN apt-get install -y nodejs

# 3. CONFIGURE PYTHON ENVIRONMENT
RUN update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.11 1
RUN pip3 install --no-cache-dir --upgrade pip

# 4. PRE-INSTALL GLOBAL PACKAGES FOR SPEED & STABILITY
# For Python (FastAPI):
RUN pip3 install --no-cache-dir uvicorn
# For Node.js (Next.js):
RUN npm install -g \
    create-next-app \
    pm2

# 5. CLEANUP
RUN apt-get clean && \
    rm -rf /var/lib/apt/lists/* && \
    rm -rf /root/.npm

# Set the default working directory for the sandbox sessions
WORKDIR /home

# The sandbox is now ready.
CMD ["/bin/bash"]