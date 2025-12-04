.PHONY: install dev format lint test clean docker-build docker-up docker-down docker-logs docker-shell docker-test docker-test-coverage docker-format docker-lint help

# Install dependencies
install:
	@echo "Installing dependencies..."
	pip install -e ".[dev]"

# Run development server
dev:
	@echo "Starting development server..."
	uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Format code with Black
format:
	@echo "Formatting code with Black..."
	black app tests

# Lint code with Ruff
lint:
	@echo "Linting code with Ruff..."
	ruff check app tests

# Run tests
test:
	@echo "Running tests..."
	pytest

# Clean Python cache files
clean:
	@echo "Cleaning Python cache files..."
	find . -type d -name "__pycache__" -exec rm -r {} + 2>/dev/null || true
	find . -type f -name "*.pyc" -delete
	find . -type f -name "*.pyo" -delete
	find . -type d -name "*.egg-info" -exec rm -r {} + 2>/dev/null || true
	find . -type d -name ".pytest_cache" -exec rm -r {} + 2>/dev/null || true

# Docker commands
docker-build:
	@echo "Building Docker image..."
	docker build -t movement-backend .

docker-up:
	@echo "Starting Docker containers..."
	@if [ ! -f .env ]; then \
		echo "Creating .env file from .env.example..."; \
		cp .env.example .env 2>/dev/null || echo "Warning: .env.example not found, using defaults"; \
	fi
	docker-compose up --build

docker-up-detached:
	@echo "Starting Docker containers in detached mode..."
	docker-compose up -d --build

docker-down:
	@echo "Stopping Docker containers..."
	docker-compose down

docker-logs:
	@echo "Showing Docker logs..."
	docker-compose logs -f

docker-shell:
	@echo "Opening shell in Docker container..."
	docker-compose exec backend /bin/bash

docker-test:
	@echo "Running tests in Docker..."
	docker-compose --profile test run --rm test

docker-test-agents:
	@echo "Running agent tests in Docker..."
	docker-compose --profile test run --rm test-agents

docker-test-coverage:
	@echo "Running tests with coverage in Docker..."
	docker-compose --profile test run --rm test pytest --cov=app --cov-report=html --cov-report=term

docker-format:
	@echo "Formatting code in Docker..."
	docker-compose --profile format run --rm format

docker-lint:
	@echo "Linting code in Docker..."
	docker-compose --profile lint run --rm lint

# Help target
help:
	@echo "Available targets:"
	@echo "  make install          - Install dependencies"
	@echo "  make dev              - Run development server"
	@echo "  make format           - Format code with Black"
	@echo "  make lint             - Lint code with Ruff"
	@echo "  make test             - Run tests"
	@echo "  make clean            - Clean Python cache files"
	@echo ""
	@echo "Docker commands:"
	@echo "  make docker-build     - Build Docker image"
	@echo "  make docker-up        - Start Docker containers"
	@echo "  make docker-up-detached - Start Docker containers in detached mode"
	@echo "  make docker-down      - Stop Docker containers"
	@echo "  make docker-logs      - Show Docker logs"
	@echo "  make docker-shell     - Open shell in Docker container"
	@echo ""
	@echo "Docker test commands:"
	@echo "  make docker-test      - Run all tests in Docker"
	@echo "  make docker-test-agents - Run agent tests (balance, orchestrator, liquidity) in Docker"
	@echo "  make docker-test-coverage - Run tests with coverage in Docker"
	@echo ""
	@echo "Docker format/lint commands:"
	@echo "  make docker-format   - Format code with Black in Docker"
	@echo "  make docker-lint     - Lint code with Ruff in Docker"
	@echo ""
	@echo "  make help             - Show this help message"

