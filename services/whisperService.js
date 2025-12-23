const { replicate } = require('../config/replicate');

/**
 * Transcribe audio to text using Whisper API
 * @param {string} audioUrl - Public URL to audio file
 * @returns {Promise<Object>} Transcription result
 */
async function transcribeAudio(audioUrl) {
    try {
        console.log('Transcribing audio:', audioUrl);

        const output = await replicate.run(
            "openai/whisper:8099696689d249cf8b122d833c36ac3f75505c666a395ca40ef26f68e7d3d16e",
            {
                input: {
                    audio: audioUrl,
                    language: "auto",  // Auto-detect language
                    translate: false,
                    temperature: 0,
                    transcription: "plain text",
                    suppress_tokens: "-1",
                    logprob_threshold: -1,
                    no_speech_threshold: 0.6,
                    condition_on_previous_text: true,
                    compression_ratio_threshold: 2.4,
                    temperature_increment_on_fallback: 0.2
                },
                wait: { interval: 500 }
            }
        );

        console.log('Whisper output:', output);

        // Extract transcription text
        const transcription = output.transcription || output.text || '';

        if (!transcription || transcription.trim().length === 0) {
            throw new Error('No transcription generated from audio');
        }

        return {
            success: true,
            transcription: transcription.trim(),
            detectedLanguage: output.detected_language || 'unknown',
            rawOutput: output
        };

    } catch (error) {
        console.error('Error transcribing audio:', error);
        return {
            success: false,
            error: error.message,
            transcription: null
        };
    }
}

module.exports = {
    transcribeAudio
};
