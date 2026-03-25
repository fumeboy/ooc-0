
export function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

export function reverse(text: string): string {
  return text.split('').reverse().join('');
}

export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// 新增函数
export function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + '...';
}
