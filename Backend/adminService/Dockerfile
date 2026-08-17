FROM node:20

WORKDIR /app

ENV PYTHON_EXECUTABLE=python3

COPY shared ./shared
COPY app ./app
COPY scripts ./scripts
COPY requirements.txt ./requirements.txt
COPY adminService ./adminService

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-pip \
    && rm -rf /var/lib/apt/lists/* \
    && python3 -m pip install --break-system-packages --no-cache-dir -r /app/requirements.txt

WORKDIR /app/adminService

RUN npm install

EXPOSE 8004

CMD ["npm", "start"]
