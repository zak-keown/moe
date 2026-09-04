function throwIfExceptionDetails(result) {
  if (!result || !result.exceptionDetails) return;
  const desc = result.exceptionDetails.exception?.description
    || result.exceptionDetails.text
    || 'unknown evaluation error';
  throw new Error(`evaluate failed: ${desc}`);
}

export { throwIfExceptionDetails };
