export { MongoConnectorError } from './base';
export { ConnectionError } from './connectionError';
export { ValidationError } from './validationError';
export { InvalidObjectIdError } from './invalidObjectIdError';
export { DuplicateKeyError } from './duplicateKeyError';
export { DocumentNotFoundError } from './documentNotFoundError';
export { OperationFailedError } from './operationFailedError';
export { parseDuplicateKeyError, extractDuplicateKeyFieldInfo } from './errorParser';
