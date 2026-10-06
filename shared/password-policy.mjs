export function newPasswordError(value) {
  if (typeof value !== 'string' || !value.trim()) {
    return '新密码不能为空或全为空格。';
  }
  return '';
}
