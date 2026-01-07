# Build stage
FROM golang:1.22-alpine AS builder

WORKDIR /app

# Copy everything
COPY . .

# Download dependencies and generate go.sum
RUN go mod tidy && go mod download

# Build the binary
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o flag-manager-api .

# Final stage
FROM alpine:3.19

RUN apk --no-cache add ca-certificates

WORKDIR /app

COPY --from=builder /app/flag-manager-api .

RUN adduser -D -u 1000 appuser && \
    mkdir -p /data/flags && \
    chown -R appuser:appuser /data

USER appuser

EXPOSE 8080

ENTRYPOINT ["./flag-manager-api"]
