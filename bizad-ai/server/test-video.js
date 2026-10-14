import 'dotenv/config';
import { experimental_generateVideo as generateVideo } from 'ai';

async function testKling() {
  try {
    console.log('🎬 Starting Kling 3.0 video test...');

    const result = await generateVideo({
      model: 'kling-v3.0',
      prompt: `
Create a premium 8-second vertical advertisement for a modern Nigerian supermarket.

Show realistic Nigerian customers shopping in a clean, modern supermarket.
Smooth cinematic camera movement, realistic human motion, professional commercial lighting,
high-quality product displays, natural colors and premium advertising cinematography.

Create a polished commercial suitable for Instagram, TikTok and WhatsApp advertising.
      `,
      aspectRatio: '9:16',
      duration: 8,
    });

    console.log('✅ VIDEO GENERATED');
    console.log(result);
  } catch (error) {
    console.error('❌ KLING TEST FAILED');
    console.error(error);
  }
}

testKling();