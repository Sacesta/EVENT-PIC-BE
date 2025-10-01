const environment = {
  development: {
    NODE_ENV: 'development',
    PORT: process.env.PORT || 5000,
    MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/pic-backend',
    JWT_SECRET: process.env.JWT_SECRET || 'your-secret-key-dev',
    FRONTEND_URL: 'http://localhost:3000',
    BACKEND_URL: 'http://localhost:5000',
    EMAIL_FROM: process.env.EMAIL_FROM || 'noreply@pic.com',
    EMAIL_USER: process.env.EMAIL_USER,
    EMAIL_PASSWORD: process.env.EMAIL_PASSWORD,
    ETHEREAL_USER: process.env.ETHEREAL_USER,
    ETHEREAL_PASS: process.env.ETHEREAL_PASS,
    CORS_ORIGINS: [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:5173',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:3001',
      'http://127.0.0.1:5173'
    ]
  },
  production: {
    NODE_ENV: 'production',
    PORT: process.env.PORT || 5000,
    MONGODB_URI: process.env.MONGODB_URI,
    JWT_SECRET: process.env.JWT_SECRET,
    FRONTEND_URL: 'https://pic-fe.vercel.app',
    BACKEND_URL: 'https://pic-be.vercel.app',
    EMAIL_FROM: process.env.EMAIL_FROM,
    EMAIL_USER: process.env.EMAIL_USER,
    EMAIL_PASSWORD: process.env.EMAIL_PASSWORD,
    CORS_ORIGINS: [
      'https://pic-fe.vercel.app',
      'https://pic-fe.vercel.app/',
      'https://pic-fe.vercel.app:443',
      'https://pic-fe.vercel.app:80'
    ]
  }
};

const currentEnv = process.env.NODE_ENV || 'development';
const config = environment[currentEnv];

// Validate required production environment variables
if (currentEnv === 'production') {
  const requiredVars = ['MONGODB_URI', 'JWT_SECRET'];
  const missingVars = requiredVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    console.error('❌ Missing required environment variables for production:', missingVars);
    process.exit(1);
  }
}

module.exports = config;
