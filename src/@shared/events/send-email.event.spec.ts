import { SendEmailEvent } from './send-email.event';

describe('SendEmailEvent', () => {
  test('constructs with properties', () => {
    const ev = new SendEmailEvent('to', 's', 'b');
    expect(ev.to).toBe('to');
    expect(ev.subject).toBe('s');
    expect(ev.body).toBe('b');
  });
});
