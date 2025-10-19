#!/usr/bin/env python3

import os
import sys
import argparse
import base64
import time
import random
from datetime import datetime
from pathlib import Path
from io import BytesIO
from openai import OpenAI, RateLimitError, APIError

def main():
    parser = argparse.ArgumentParser(
        description='Generate sticker images from text prompts using OpenAI GPT Image'
    )
    parser.add_argument('-f', '--file', required=True, help='Path to text file containing prompts (one per line)')
    parser.add_argument('-o', '--output', help='Output directory for generated images (defaults to current directory)')
    parser.add_argument('-k', '--api-key', help='OpenAI API key (or set OPENAI_API_KEY environment variable)')

    args = parser.parse_args()

    # Get API key
    api_key = args.api_key or os.environ.get('OPENAI_API_KEY')
    if not api_key:
        print('❌ Error: OpenAI API key is required. Set OPENAI_API_KEY environment variable or use --api-key option.')
        sys.exit(1)

    # Initialize OpenAI client
    client = OpenAI(api_key=api_key)

    # Read prompts file
    prompts_file = Path(args.file).resolve()
    if not prompts_file.exists():
        print(f'❌ Error: File not found: {prompts_file}')
        sys.exit(1)

    with open(prompts_file, 'r') as f:
        prompts = [line.strip() for line in f if line.strip()]

    if not prompts:
        print('❌ Error: No prompts found in file.')
        sys.exit(1)

    print(f'📝 Found {len(prompts)} prompt(s) to process\n')

    # Setup output directory
    if args.output:
        output_dir = Path(args.output).resolve()
    else:
        # Default to Stickers/ folder in project root
        output_dir = Path.cwd() / 'Stickers'

    output_dir.mkdir(parents=True, exist_ok=True)

    print(f'📁 Output directory: {output_dir}\n')

    # Adaptive rate limiting variables for tier 3
    # Adjust starting delay based on your tier limits shown at:
    # https://platform.openai.com/settings/organization/limits
    delay = 5.0           # tier 3: start at 5s (≈12 RPM) - adjust based on your actual limits
    max_delay = 120.0     # cap backoff
    success_streak = 0

    def jitter(s):
        """Add +/-10% jitter to delay"""
        return s * random.uniform(0.9, 1.1)

    # Process each prompt
    for i, prompt in enumerate(prompts, 1):
        print(f'[{i}/{len(prompts)}] Generating: "{prompt}"')

        # Proactive throttling with jitter
        if i > 1:  # skip delay for first request
            sleep_time = jitter(delay)
            print(f'⏳ Waiting {sleep_time:.1f}s before next request...')
            time.sleep(sleep_time)

        try:
            # Universal Sticker Generator Prompt
            # Professional vinyl sticker designer prompt with flat vector/doodle style
            enhanced_prompt = (
                f'{prompt} — '
                f'flat vector or doodle style with clean lines no shading or photorealism, '
                f'transparent background PNG-ready for cutting, '
                f'isolated composition not touching edges centered within canvas, '
                f'bold outlines for clear cut lines, '
                f'high contrast color palette 2-4 tones, '
                f'cute expressive or aesthetic shape that looks great as a sticker, '
                f'no drop shadows no textures outside the design'
            )

            response = client.images.generate(
                model='gpt-image-1',
                prompt=enhanced_prompt,
                size='1024x1024',
                quality='auto',
                output_compression=100
            )

            # gpt-image-1 returns base64 encoded image data
            image_base64 = response.data[0].b64_json
            image_bytes = base64.b64decode(image_base64)

            # Create filename from prompt (sanitized)
            sanitized = ''.join(c if c.isalnum() or c.isspace() else '-' for c in prompt.lower())
            sanitized = '-'.join(sanitized.split())[:50]
            filename = f'{str(i).zfill(3)}-{sanitized}.png'
            filepath = output_dir / filename

            with open(filepath, 'wb') as f:
                f.write(image_bytes)

            print(f'✅ Saved: {filename}')

            # Successful request - cautiously speed up after consecutive successes
            success_streak += 1
            if success_streak >= 5 and delay > 2.0:
                delay = max(2.0, delay * 0.9)
                print(f'🚀 Rate limit confidence increased, reducing delay to {delay:.1f}s')
                success_streak = 0

        except RateLimitError as e:
            success_streak = 0
            # Prefer server guidance if available
            retry_after = None
            if hasattr(e, 'response') and e.response is not None:
                retry_after = e.response.headers.get('retry-after')

            if retry_after:
                wait_time = jitter(float(retry_after))
                print(f'⚠️  Rate limit hit. Server says retry after {retry_after}s. Waiting {wait_time:.1f}s...')
                time.sleep(wait_time)
            else:
                delay = min(max_delay, delay * 2.0)
                wait_time = jitter(delay)
                print(f'⚠️  Rate limit hit. Backing off exponentially. New delay: {delay:.1f}s. Waiting {wait_time:.1f}s...')
                time.sleep(wait_time)

            # Retry this prompt (decrement counter)
            print(f'🔄 Retrying: "{prompt}"')
            continue

        except APIError as e:
            # Transient 5xx errors: brief backoff then continue
            wait_time = jitter(min(max_delay, delay * 1.5))
            print(f'⚠️  API error (likely transient): {str(e)}')
            print(f'⏳ Backing off for {wait_time:.1f}s before continuing...')
            time.sleep(wait_time)
            print(f'❌ Skipping: "{prompt}"\n')

        except Exception as e:
            print(f'❌ Failed to generate image: {str(e)}\n')

    print(f'\n🎉 Complete! Generated {len(prompts)} sticker(s) in {output_dir}')

if __name__ == '__main__':
    main()
