# ==========================================================
# CARGO CHEF
# ==========================================================

FROM rust:1-bookworm AS chef

RUN cargo install cargo-chef --locked

WORKDIR /app


# ==========================================================
# DEPENDENCY PLANNER
# ==========================================================

FROM chef AS planner

COPY . .

RUN cargo chef prepare \
    --recipe-path recipe.json


# ==========================================================
# BUILD
# ==========================================================

FROM chef AS builder

COPY --from=planner \
    /app/recipe.json \
    recipe.json

RUN cargo chef cook \
    --release \
    --recipe-path recipe.json

COPY . .

RUN cargo build \
    --release \
    --bin backend


# ==========================================================
# RUNTIME
# ==========================================================

FROM debian:bookworm-slim AS runtime

RUN apt-get update \
    && apt-get install -y \
    --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder \
    /app/target/release/backend \
    /usr/local/bin/backend

ENV PORT=8080

EXPOSE 8080

ENTRYPOINT ["/usr/local/bin/backend"]