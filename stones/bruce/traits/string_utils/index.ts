
export function reverse(ctx, str) {
  if (typeof str !== 'string') throw new Error('reverse requires a string');
  return str.split('').reverse().join('');
}

export function capitalize(ctx, str) {
  if (typeof str !== 'string') throw new Error('capitalize requires a string');
  return str.charAt(0).toUpperCase() + str.slice(1);
}
