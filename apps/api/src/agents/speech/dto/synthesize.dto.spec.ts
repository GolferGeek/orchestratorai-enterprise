import { validate } from 'class-validator';
import { SynthesizeDto } from './synthesize.dto';

describe('SynthesizeDto bounds', () => {
  it('rejects oversized text, unsafe voice IDs, and out-of-range speed', async () => {
    const dto = new SynthesizeDto();
    dto.text = 'x'.repeat(10_001);
    dto.voiceName = '../other/path';
    dto.speakingRate = 4;

    const errors = await validate(dto);

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['text', 'voiceName', 'speakingRate']),
    );
  });
});
