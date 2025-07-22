// File: /api/yt.js

import axios from 'axios';
import cheerio from 'cheerio';

const extractVideoId = (url) => {
  const match = url.match(/(?:v=|\/)([0-9A-Za-z_-]{11})/);
  return match ? match[1] : null;
};

export default async function handler(req, res) {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'Missing video URL' });
  }

  const videoId = extractVideoId(url);
  let mp3Url = null;
  let duration = null;

  try {
    const form = new URLSearchParams();
    form.append('q', url);
    form.append('type', 'mp3');

    const yt1sRes = await axios.post('https://yt1s.click/search', form.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Origin': 'https://yt1s.click',
        'Referer': 'https://yt1s.click/',
        'User-Agent': 'Mozilla/5.0'
      },
    });

    const $ = cheerio.load(yt1sRes.data);
    const link = $('a[href*="download"]').attr('href');
    if (link) {
      mp3Url = link;
    } else {
      const payload = { fileType: 'MP3', id: videoId };
      const mp3Res = await axios.post('https://ht.flvto.online/converter', payload, {
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'https://ht.flvto.online',
          'Referer': `https://ht.flvto.online/widget?url=https://www.youtube.com/watch?v=${videoId}`,
          'User-Agent': 'Mozilla/5.0',
        },
      });

      if (mp3Res.data?.link) {
        mp3Url = mp3Res.data.link;
        duration = mp3Res.data.duration || null;
      }
    }
  } catch (e) {
    mp3Url = null;
  }

  // Clipto part
  try {
    const csrfres = await axios.get('https://www.clipto.com/api/csrf', {
      headers: {
        'user-agent': 'Mozilla/5.0',
        'referer': 'https://www.clipto.com/id/media-downloader/youtube-downloader'
      }
    });

    const csrftoken = csrfres.data.token;
    const kuki = `XSRF-TOKEN=${csrftoken}`;

    const cliptoRes = await axios.post('https://www.clipto.com/api/youtube', { url }, {
      headers: {
        'x-xsrf-token': csrftoken,
        'cookie': kuki,
        'origin': 'https://www.clipto.com',
        'referer': 'https://www.clipto.com/id/media-downloader/youtube-downloader',
        'content-type': 'application/json',
        'user-agent': 'Mozilla/5.0'
      }
    });

    const data = cliptoRes.data;

    const mp4WithAudio = data.medias.find(v =>
      v.ext === 'mp4' &&
      (v.is_audio === true || v.audioQuality)
    );

    if (!duration && data.duration) {
      duration = data.duration;
    }

    return res.status(200).json({
      title: data.title,
      thumbnail: data.thumbnail,
      mp4: mp4WithAudio ? mp4WithAudio.url : null,
      mp3: mp3Url,
      duration: duration ? Math.round(duration) + 's' : null
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch from clipto or other sources', details: err.message });
  }
}
