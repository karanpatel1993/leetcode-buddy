#!/bin/bash

# This script generates simple placeholder icons for the LeetCode Buddy extension
# You can replace these with custom icons later

# Create a simple SVG icon
cat > icon.svg << EOL
<svg width="128" height="128" xmlns="http://www.w3.org/2000/svg">
  <rect width="128" height="128" fill="#2cbb5d" rx="20" ry="20"/>
  <text x="64" y="80" font-family="Arial" font-size="70" text-anchor="middle" fill="white">LB</text>
</svg>
EOL

# Convert SVG to PNG icons of different sizes
# This requires librsvg (install with: brew install librsvg)
# If you don't have it, you can manually create icons later
if command -v rsvg-convert &> /dev/null; then
  rsvg-convert -w 16 -h 16 icon.svg > icon16.png
  rsvg-convert -w 48 -h 48 icon.svg > icon48.png
  rsvg-convert -w 128 -h 128 icon.svg > icon128.png
  echo "Icons generated successfully!"
else
  echo "Please install librsvg or manually create icon16.png, icon48.png, and icon128.png files."
  echo "For macOS, run: brew install librsvg"
fi 