# Build go-feature-flag v1.51.2 from source with patched Go stdlib.
#
# The upstream Docker image (gofeatureflag/go-feature-flag:v1.51.2) ships
# Go 1.25.0, which contains multiple HIGH-severity CVEs in the stdlib:
#   CVE-2025-58188, CVE-2025-58187, CVE-2025-61725,
#   CVE-2025-61723, CVE-2025-61729
#
# All are fixed in Go >= 1.25.5. This Dockerfile rebuilds v1.51.2
# using Go 1.25.6 to remediate those vulnerabilities.

# ---------------------------------------------------------------------
# Stage 1: Build
# ---------------------------------------------------------------------
FROM golang:1.25.6-bookworm AS builder

ARG GOFF_VERSION=v1.51.2

RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /src

# Clone the exact release tag
RUN git clone --depth 1 --branch "${GOFF_VERSION}" \
    https://github.com/thomaspoignant/go-feature-flag.git .

# Build a fully-static relay proxy binary (matches upstream goreleaser config)
RUN CGO_ENABLED=0 GOWORK=off go build \
    -trimpath \
    -ldflags "-s -w -X 'main.version=${GOFF_VERSION}'" \
    -o /go-feature-flag \
    ./cmd/relayproxy/

# ---------------------------------------------------------------------
# Stage 2: Runtime — distroless (matches upstream image base)
# ---------------------------------------------------------------------
FROM gcr.io/distroless/static-debian12:latest

COPY --from=builder /go-feature-flag /go-feature-flag

EXPOSE 1031

CMD ["/go-feature-flag"]
