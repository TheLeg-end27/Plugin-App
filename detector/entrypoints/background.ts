import { queryRdap } from '../utils/rdap';
import { calcEntropy } from '../utils/entropy';

export default defineBackground(() => {
  queryRdap('google.com').then(r => console.log('[RDAP TEST]', r));
  console.log('[ENTROPY] google:', calcEntropy('google'));
  console.log('[ENTROPY] paypal:', calcEntropy('paypal'));
  console.log('[ENTROPY] xk4f9qz2:', calcEntropy('xk4f9qz2'));
});