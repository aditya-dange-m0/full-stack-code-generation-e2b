# 🚀 AI Code Generator Backend with E2B Sandboxes

A NestJS-based backend service that provides AI-powered code generation and execution using E2B sandboxes. This project enables secure execution of AI-generated code in isolated cloud environments.

## 🌟 Features

- **🔒 Secure Code Execution**: Run AI-generated code in isolated E2B sandboxes
- **🏗️ Full-Stack Generation**: Create complete applications with backend (FastAPI) and frontend (Next.js)
- **🗃️ PostgreSQL Integration**: Pre-configured PostgreSQL database for full-stack applications
- **⚡ Multiple Setup Methods**: Fast manual setup and traditional create-next-app approaches
- **📊 Real-time Monitoring**: Comprehensive logging and error handling
- **🐳 Custom Docker Templates**: Pre-configured environments with Node.js, Python, PostgreSQL, and PM2
- **🌐 CORS Support**: Ready for cross-origin requests
- **🔄 Auto-cleanup**: Automatic sandbox lifecycle management

## 📋 Prerequisites

Before setting up the project, ensure you have:

- **Node.js** (v18 or higher)
- **npm** or **yarn**
- **Docker Desktop** (running and accessible)
- **E2B Account** (free at [e2b.dev](https://e2b.dev))

## 🛠️ Installation

### 1. Clone the Repository

```bash
git clone https://github.com/aditya-dange-m0/full-stack-code-generation-e2b.git
cd ai-code-generator-backend
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Install E2B CLI Global Package

```bash
npm install -g @e2b/cli
```

## 🔐 E2B Setup & Custom Sandbox Template

### Step 1: Authenticate with E2B

```bash
e2b auth login
```

This will open your browser to complete the authentication process.

### Step 2: Build Custom Sandbox Template

Our project uses a custom sandbox template with pre-installed tools. Build it using:

```bash
e2b template build --name nest-next-generator-sandbox .
```

This command:
- Uses the `e2b.Dockerfile` in the project root
- Creates a custom template with Node.js, Python, PM2, and other tools
- Registers the template with your E2B account

### Step 3: Get Your Template ID

After building, E2B will provide a template ID. You can also find it using:

```bash
e2b template list
```

Look for `nest-next-generator-sandbox` in the output.

### Step 4: Configure Environment Variables

Create a `.env` file in the project root:

```bash
# E2B Configuration
E2B_API_KEY="your_e2b_api_key_here"
E2B_TEMPLATE_ID="nest-next-generator-sandbox"

# Optional: Application Configuration
PORT=3000
```

**To get your E2B API Key:**
1. Visit [E2B Dashboard](https://e2b.dev/dashboard)
2. Go to "API Keys" section
3. Create a new API key
4. Copy and paste it into your `.env` file

## 🐳 Custom Docker Template Details

Our `e2b.Dockerfile` includes:

```dockerfile
# Base: Ubuntu 22.04
# Node.js: v20.x (Latest LTS)
# Python: 3.11
# PostgreSQL: 14.x with pre-configured database
# Global Packages:
#   - PM2 (Process Manager)
#   - create-next-app
#   - uvicorn (Python ASGI server)
#   - asyncpg (PostgreSQL async driver)
# Additional Tools:
#   - curl, wget, git, unzip
#   - build-essential
#   - netcat (network utilities)
```

### PostgreSQL Configuration

The template includes a **pre-configured PostgreSQL setup**:

- **Database**: `appdb`
- **User**: `appuser` 
- **Password**: `apppassword`
- **Connection String**: `postgresql://appuser:apppassword@localhost:5432/appdb`

This setup is configured during the Docker image build process, ensuring:
- ✅ No setup time required in each sandbox session
- ✅ Consistent database configuration
- ✅ Ready-to-use database for AI-generated applications

To start PostgreSQL in a sandbox session:
```typescript
await sandboxService.startPostgreSQL();
```

This ensures our sandboxes have all necessary tools pre-installed for faster execution.

## 🚀 Running the Application

### Development Mode

```bash
npm run start:dev
```

### Production Mode

```bash
npm run build
npm run start:prod
```

The server will start on `http://localhost:3000` (or your configured PORT).

## 🧪 API Endpoints

### Core Testing Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/sandbox/test` | GET | Test basic sandbox functionality (PM2 version check) |
| `/sandbox/test-backend-only` | GET | Test FastAPI backend setup in isolation |
| `/sandbox/full-stack-test` | GET | Complete full-stack test (FastAPI + Next.js) |
| `/sandbox/full-stack-test-optimized` | GET | Optimized full-stack test with fast setup |

### PostgreSQL Database Integration

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/sandbox/test-postgresql` | GET | Test PostgreSQL connection and setup |
| `/sandbox/start-postgresql` | GET | Start PostgreSQL service in sandbox |
| `/sandbox/postgresql-info` | GET | Get PostgreSQL connection details |
| `/sandbox/test-fullstack-with-db` | GET | Full-stack test with PostgreSQL integration |

### Individual Component Tests

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/sandbox/create-nextjs-fast` | GET | Create Next.js app using fast manual setup |
| `/sandbox/create-nextjs-original` | GET | Create Next.js app using create-next-app |

### Example Responses

#### Successful Full-Stack Test
```json
{
  "backendUrl": "https://sandbox-id.e2b.dev:8000",
  "frontendUrl": "https://sandbox-id.e2b.dev:3000"
}
```

#### Backend-Only Test
```json
{
  "backendUrl": "https://sandbox-id.e2b.dev:8000",
  "testResult": "{\"message\": \"Hello from FastAPI Backend!\", \"status\": \"success\"}"
}
```

#### PostgreSQL Test
```json
{
  "isConnected": true,
  "info": "PostgreSQL 14.9 (Ubuntu 14.9-0ubuntu0.22.04.1) on x86_64-pc-linux-gnu"
}
```

#### Full-Stack with PostgreSQL
```json
{
  "backendUrl": "https://sandbox-id.e2b.dev:8000",
  "frontendUrl": "https://sandbox-id.e2b.dev:3000",
  "databaseInfo": {
    "host": "localhost",
    "port": 5432,
    "database": "appdb",
    "username": "appuser",
    "connectionString": "postgresql://appuser:apppassword@localhost:5432/appdb",
    "status": "connected"
  }
}
```

## 🔧 Configuration Options

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `E2B_API_KEY` | ✅ | - | Your E2B API key |
| `E2B_TEMPLATE_ID` | ✅ | - | Custom sandbox template ID |
| `PORT` | ❌ | 3000 | Application port |

### Timeout Configuration

The service includes configurable timeouts for different operations:

- **Regular commands**: 60 seconds
- **Long commands**: 10 minutes  
- **pip install**: 3 minutes
- **npm install**: 5 minutes

## 🐛 Troubleshooting

### Common Issues

#### 1. Docker Not Running
```
Error: error during connect: Head "http://...": open //./pipe/dockerDesktopLinuxEngine
```
**Solution**: Start Docker Desktop and ensure it's running.

#### 2. Invalid API Key
```
SandboxError: 401: Invalid API key
```
**Solution**: 
- Check your `.env` file has the correct `E2B_API_KEY`
- Verify the API key at [E2B Dashboard](https://e2b.dev/dashboard)

#### 3. Template Not Found
```
Error: Template 'nest-next-generator-sandbox' not found
```
**Solution**: 
- Run `e2b template build --name nest-next-generator-sandbox .`
- Check `e2b template list` to verify the template exists

#### 4. Timeout Errors
```
TimeoutError: [deadline_exceeded] the operation timed out
```
**Solution**: 
- Try the optimized endpoint: `/sandbox/full-stack-test-optimized`
- Check your internet connection
- Increase timeout values if needed

#### 5. PostgreSQL Connection Issues
```
Error: Database connection failed: connection refused
```
**Solution**: 
- Ensure PostgreSQL is started: `GET /sandbox/start-postgresql`
- Check connection with: `GET /sandbox/test-postgresql`
- Rebuild template if database setup is missing

#### 6. PostgreSQL Service Not Starting
```
Error: Failed to start PostgreSQL: service postgresql start failed
```
**Solution**: 
- Template rebuild required: `e2b template build --name nest-next-generator-sandbox .`
- Check Docker template includes PostgreSQL installation
- Verify PostgreSQL was configured during image build

### Debug Logs

Enable detailed logging by checking the console output. The service provides comprehensive logs for:
- Sandbox creation and lifecycle
- Command execution with stdout/stderr
- File operations and service startup
- Error details with full context

### Testing Strategy

1. **Start Simple**: Test `/sandbox/test` first
2. **Database Check**: Test `/sandbox/test-postgresql` for database connectivity
3. **Isolate Issues**: Use `/sandbox/test-backend-only` for backend problems
4. **Database Integration**: Try `/sandbox/test-fullstack-with-db` for full PostgreSQL stack
5. **Try Optimized**: Use `/sandbox/full-stack-test-optimized` for faster execution
6. **Fallback**: Use `/sandbox/full-stack-test` if optimized version fails

## 📁 Project Structure

```
src/
├── sandbox/
│   ├── sandbox.controller.ts    # API endpoints
│   ├── sandbox.service.ts       # Core sandbox logic
│   ├── sandbox.module.ts        # NestJS module
│   └── templates.ts             # FastAPI & Next.js templates
├── app.module.ts                # Main application module
└── main.ts                      # Application entry point
e2b.Dockerfile                   # Custom sandbox template
e2b.toml                         # E2B configuration
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Commit your changes: `git commit -m 'Add feature'`
4. Push to the branch: `git push origin feature-name`
5. Open a Pull Request

## 📚 Documentation

- [E2B Documentation](https://e2b.dev/docs)
- [NestJS Documentation](https://docs.nestjs.com)
- [FastAPI Documentation](https://fastapi.tiangolo.com)
- [Next.js Documentation](https://nextjs.org/docs)

## 📄 License

This project is [MIT licensed](LICENSE).

## 🆘 Support

- **Issues**: [GitHub Issues](https://github.com/aditya-dange-m0/full-stack-code-generation-e2b/issues)
- **E2B Support**: [E2B Discord](https://discord.gg/U7KEcGErtQ)
- **NestJS Support**: [NestJS Discord](https://discord.gg/G7Qnnhy)

---

**Made with ❤️ using NestJS and E2B**
