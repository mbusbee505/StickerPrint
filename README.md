# StickerPrint

A simple CLI tool to generate sticker images from text prompts using OpenAI's DALL-E 3 API.

## Setup

1. **Install Python dependencies:**
   ```bash
   pip3 install -r requirements.txt
   ```

2. **Set your OpenAI API key:**
   ```bash
   export OPENAI_API_KEY='your-api-key-here'
   ```

   Or add it to your `~/.zshrc` or `~/.bash_profile` to make it permanent:
   ```bash
   echo "export OPENAI_API_KEY='your-api-key-here'" >> ~/.zshrc
   source ~/.zshrc
   ```

## Usage

### Basic Usage (output to current directory)
```bash
python3 stickerprint.py -f prompts.txt
```

### Specify Output Directory
```bash
python3 stickerprint.py -f prompts.txt -o ~/Desktop
```

### Pass API Key Directly
```bash
python3 stickerprint.py -f prompts.txt -k your-api-key-here
```

## Prompt File Format

Create a `.txt` file with one prompt per line:

```
cute cat wearing sunglasses
happy dog with a party hat
coffee cup with steam
mountain landscape
```

Empty lines are ignored.

## Output

- Images are saved to a timestamped folder (e.g., `stickers-2025-10-17-1234567890`)
- Filenames are numbered and based on the prompt text
- Images are 1024x1024 PNG format
- Sticker-style with white backgrounds, centered designs, and space around edges

## Features

- ✅ Uses DALL-E 3 (latest OpenAI image model)
- ✅ Generates sticker-style images with white backgrounds
- ✅ Processes prompts sequentially
- ✅ Creates organized output folders
- ✅ Simple to use - no complicated setup
- ✅ Descriptive filenames based on prompts
- ✅ Progress indicators during generation

## Requirements

- Python 3.7 or higher
- OpenAI API key with access to DALL-E 3
- Internet connection

## Cost Note

DALL-E 3 charges per image generated. Check OpenAI's current pricing at https://openai.com/pricing
