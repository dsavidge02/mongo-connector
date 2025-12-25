# Project Context: TypeScript MongoDB Library

## Tech Stack
- Language: TypeScript 5.9.3
- Runtime: Node.js (ES2019, CommonJS)
- Database: MongoDB 6.17.0 (official driver)
- Testing: Jest 29.7.0 with ts-jest, mongodb-memory-server
- Build: TypeScript Compiler (tsc)
- CI/CD: GitHub Actions (type check, build, test, publish)

## Detected Style
- Coding Style: camelCase methods, PascalCase classes
- Architecture: Singleton Pattern for database connector
- Indentation: 4 spaces
- Semicolons: Required
- Error Handling: Try-catch with console logging and error throwing
- Type Safety: Strict TypeScript with extensive use of generics

## Project Type
- NPM Library Package (not an application)
- Published to npm registry
- Provides reusable database utilities

## Key Rules
- Use Singleton pattern for stateful service classes
- Implement comprehensive error handling with descriptive messages
- Leverage TypeScript generics for type-safe database operations
- Write tests using in-memory MongoDB for isolation
- Maintain strict TypeScript configuration
- Use async/await for all database operations
- Validate inputs and throw errors with clear messages

## Strictness: Low
- Refactoring: Only touch what is necessary
- New Code: Apply full standards to new features only
- Legacy Code: Document issues but don't force refactoring

## Active Phase
- Current: Phase 0 (Skeleton)

## Architecture Patterns
- **Singleton**: Single instance of MongoConnector across application
- **Generic CRUD**: Type-safe operations using TypeScript generics
- **Connection Management**: Explicit connect/close lifecycle
- **Database Abstraction**: Simplified interface over MongoDB driver