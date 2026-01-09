jest.mock('axios');

import axios from 'axios';
import { DiscordNotificationProvider } from './discord.notification.provider';

describe('DiscordNotificationProvider', () => {
  beforeEach(() => jest.clearAllMocks());

  test('handle posts to axios with content', async () => {
    (axios.post as jest.Mock).mockResolvedValue({ status: 204 });
    const p = new DiscordNotificationProvider();
    await expect(p.handle('hello')).resolves.toBeUndefined();
    expect(axios.post).toHaveBeenCalled();
  });

  test('handle catches errors and does not throw', async () => {
    (axios.post as jest.Mock).mockRejectedValue(new Error('bad'));
    const p = new DiscordNotificationProvider();
    await expect(p.handle('x')).resolves.toBeUndefined();
  });
});
