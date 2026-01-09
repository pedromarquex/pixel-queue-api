jest.mock('axios');

import axios from 'axios';
import { geocodeAddress } from './geocodeAddress';

describe('geocodeAddress', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns lat/lng when API returns results', async () => {
    (axios.get as jest.Mock).mockResolvedValue({
      data: { results: [{ geometry: { location: { lat: 1.23, lng: 4.56 } } }] },
    });

    const res = await geocodeAddress('Rua A');
    expect(res).toEqual({ latitude: '1.23', longitude: '4.56' });
    expect(axios.get).toHaveBeenCalled();
  });

  test('throws when no results', async () => {
    (axios.get as jest.Mock).mockResolvedValue({ data: { results: [] } });
    await expect(geocodeAddress('Rua B')).rejects.toThrow(
      'Endereço não encontrado',
    );
  });

  test('re-throws when axios fails', async () => {
    (axios.get as jest.Mock).mockRejectedValue(new Error('network'));
    await expect(geocodeAddress('Rue')).rejects.toThrow('network');
  });
});
