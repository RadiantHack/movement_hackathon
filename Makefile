.PHONY: format-frontend format-backend format help

# Format frontend code using Prettier
format-frontend:
	@echo "Formatting frontend code..."
	cd frontend && npm run format

# Format backend code (add your backend formatting command here)
format-backend:
	@echo "Formatting backend code..."
	@if [ -d "backend" ] && [ -f "backend/Makefile" ]; then \
		cd backend && make format; \
	elif [ -d "backend" ] && [ -f "backend/package.json" ]; then \
		cd backend && npm run format; \
	else \
		echo "Backend formatting not configured yet"; \
	fi

# Format both frontend and backend
format: format-frontend format-backend
	@echo "Formatting complete!"

# Help target
help:
	@echo "Available targets:"
	@echo "  make format-frontend  - Format frontend code using Prettier"
	@echo "  make format-backend   - Format backend code"
	@echo "  make format           - Format both frontend and backend"
	@echo "  make help             - Show this help message"

