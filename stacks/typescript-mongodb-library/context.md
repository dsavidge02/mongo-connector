# Project Context: TypeScript MongoDB Library

## Tech Stack
- Language: TypeScript 5.9.3
- Runtime: Node.js 20+ (ES2019, CommonJS)
- Database: MongoDB 6.17.0 (official driver)
- Testing: Jest 29.7.0 with ts-jest, mongodb-memory-server 10.1.3
- Build: TypeScript Compiler (tsc)
- CI/CD: GitHub Actions (type check, build, test, publish to npm)
- Package Manager: npm

## Detected Style
- Coding Style: camelCase for methods/variables, PascalCase for classes/interfaces
- Architecture: Singleton Pattern for database connector, Modular error handling
- Indentation: 4 spaces
- Semicolons: Required
- Error Handling: Custom error classes extending base MongoConnectorError
- Type Safety: Strict TypeScript with extensive use of generics
- Documentation: JSDoc comments with @param, @returns, @throws, @example tags
- Module Organization: Feature-based subdirectories (errors/, utils/, types/)

## Project Type
- NPM Library Package (not an application)
- Published to npm registry as `@dsavidge02/mongo-connector-ts`
- Provides reusable MongoDB database utilities
- Dual export points: main connector + testing utilities

## Key Rules
- Use Singleton pattern for stateful service classes
- Implement comprehensive error handling with custom error classes
- Leverage TypeScript generics for type-safe database operations
- Write tests using in-memory MongoDB (mongodb-memory-server) for isolation
- Maintain strict TypeScript configuration (strict mode enabled)
- Use async/await for all database operations
- Validate inputs using utility functions (assertNotEmpty, assertRequired)
- Include JSDoc documentation for all public methods
- Export clean interfaces from index files
- Use retry logic with exponential backoff for resilient operations

## Strictness: Medium
- Refactoring: Touch what is necessary, but maintain existing patterns
- New Code: Apply full standards including JSDoc, error handling, and tests
- Legacy Code: Document issues and refactor if it improves maintainability
- Testing: All new features must have corresponding test coverage

## Active Phase
- Current: Phase 1+ (Active Development & Maintenance)

## Architecture Patterns
- **Singleton**: Single instance of MongoConnector across application lifecycle
- **Generic CRUD**: Type-safe operations using TypeScript generics (WithId<T>, Filter<T>)
- **Connection Management**: Explicit connect/close lifecycle with connection state tracking
- **Database Abstraction**: Simplified interface over MongoDB driver with utility methods
- **Custom Error Hierarchy**: Specialized error classes for different failure scenarios
- **Retry Pattern**: Configurable retry logic with exponential backoff for transient failures
- **Modular Organization**: Separated concerns (errors, utils, types) in dedicated directories
- **Dual Export Strategy**: Main connector + testing utilities for flexible consumption

## Directory Structure
```
src/
├── errors/          # Custom error classes
├── types/           # TypeScript interfaces and types
├── utils/           # Utility functions (retry, validation, objectId conversion)
├── __tests__/       # Test files co-located with source
├── mongoConnector.ts # Main singleton connector class
├── index.ts         # Main export point
└── testing.ts       # Testing utilities export
```