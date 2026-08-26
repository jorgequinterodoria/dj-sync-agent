import {
  test,
} from 'node:test';

import assert from 'node:assert/strict';

import {
  clampPageSize,
  normalizeSearch,
  toSummary,
} from './rekordbox-library.js';

test(
  'library page size is clamped',
  () => {
    assert.equal(
      clampPageSize(0),
      100,
    );

    assert.equal(
      clampPageSize(-5),
      100,
    );

    assert.equal(
      clampPageSize(50),
      50,
    );

    assert.equal(
      clampPageSize(999),
      250,
    );
  },
);

test(
  'library search is normalized',
  () => {
    assert.equal(
      normalizeSearch(
        '  Abba   Dancing Queen  ',
      ),
      'Abba Dancing Queen',
    );

    assert.equal(
      normalizeSearch(
        undefined,
      ),
      '',
    );
  },
);

test(
  'library summary preserves normalized track fields',
  () => {
    const summary =
      toSummary({
        schemaVersion: 1,

        identity: {
          id: '123',
          uuid: 'uuid-1',
        },

        metadata: {
          title:
            'Dancing Queen',
          artist:
            'Abba',
          album:
            'Album',
          genre:
            'Disco',
          label:
            'Label',
          key:
            'Am',
          remixer:
            null,
          composer:
            null,
          isrc:
            null,
        },

        technical: {
          bpmRaw: 12300,
          bpm: 123,
          lengthSeconds:
            210.5,
          bitrate:
            128000,
          bitDepth:
            null,
          sampleRate:
            44100,
          rating:
            4,
          playCount:
            12,
          fileType:
            1,
          analyzed:
            1,
        },

        primaryFile: {
          id:
            'file-1',
          path:
            '/Music/track.mp3',
          localPath:
            '/Music/track.mp3',
          hash:
            null,
          size:
            1234,
          kind:
            'media',
        },

        files: [],
        cues: [],
        playlists: [],

        sync: {
          rbLocalDeleted:
            0,
          rbLocalUsn:
            456,
          updatedAt:
            '2026-01-01T00:00:00.000Z',
        },
      });

    assert.deepEqual(
      summary,
      {
        id: '123',
        title:
          'Dancing Queen',
        artist:
          'Abba',
        album:
          'Album',
        bpm:
          123,
        key:
          'Am',
        lengthSeconds:
          210.5,
        rating:
          4,
        playCount:
          12,
        genre:
          'Disco',
        filePath:
          '/Music/track.mp3',
        analyzed:
          1,
        rbLocalUsn:
          456,
      },
    );
  },
);