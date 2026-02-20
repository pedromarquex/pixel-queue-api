import axios from 'axios';

export async function geocodeAddress(
  address: string,
): Promise<{ latitude: string; longitude: string }> {
  const apiKey = 'YOUR_GOOGLE_MAPS_API_KEY'; // Substitua pela sua chave de API do Google Maps
  if (!apiKey) {
    throw new Error('Google Maps API key is not configured');
  }

  const encodedAddress = encodeURIComponent(address);
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodedAddress}&key=${apiKey}`;

  const response = await axios.get(url);
  const results = response.data.results;

  if (results && results.length > 0) {
    const location = results[0].geometry.location;
    return {
      latitude: location.lat.toString(),
      longitude: location.lng.toString(),
    };
  } else {
    throw new Error('Endereço não encontrado');
  }
}
