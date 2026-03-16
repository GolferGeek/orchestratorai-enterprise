# Video Management System

This directory contains the centralized video management system for the Orchestrator AI website.

## How to Add New Videos

### 1. Edit `videos.json`

To add a new video, simply edit the `videos.json` file:

```json
{
  "categoryOrder": [
    "introduction",
    "privacy-security", 
    "how-we-work",
    "evaluations",
    "what-were-working-on-next",
    "demos"
  ],
  "categories": {
    "introduction": {
      "title": "Introduction",
      "description": "Get to know Orchestrator AI...",
      "order": 1,
      "videos": [
        {
          "id": "intro-main",
          "title": "Introduction to Orchestrator AI",
          "description": "Get to know Orchestrator AI...",
          "url": "https://www.loom.com/embed/YOUR_VIDEO_ID",
          "duration": "5:30",
          "createdAt": "2024-01-15",
          "featured": true,
          "order": 1
        }
      ]
    }
  }
}
```

### 2. Video Properties

Each video needs these properties:

- **id**: Unique identifier (e.g., "intro-main")
- **title**: Display title for the video
- **description**: Brief description of the video content
- **url**: Full Loom embed URL (e.g., "https://www.loom.com/embed/VIDEO_ID")
- **duration**: Video length in MM:SS format
- **createdAt**: Date when video was created (YYYY-MM-DD)
- **featured**: Boolean - if true, shows on landing page buttons
- **order**: Number for sorting within category (1, 2, 3, etc.)

### 3. Category Properties

Each category needs:

- **title**: Display name for the category
- **description**: Brief description of the category
- **order**: Number for sorting categories (1, 2, 3, etc.)
- **videos**: Array of video objects

### 4. Category Order

The `categoryOrder` array controls the display order of categories. Add new category keys here to include them in the display.

## Adding New Categories

1. Add the category key to `categoryOrder` array
2. Add the full category object to `categories`
3. Set appropriate `order` numbers

## Adding New Videos

1. Find the appropriate category in `categories`
2. Add the video object to the category's `videos` array
3. Set `featured: true` if you want it to appear on landing page buttons
4. Set appropriate `order` number for sorting within the category

## Examples

### Adding a New Demo Video

```json
"demos": {
  "title": "Demos & Behind-the-Scenes",
  "description": "Watch our latest demos...",
  "order": 6,
  "videos": [
    {
      "id": "demo-3",
      "title": "New Feature Demo",
      "description": "See our latest feature in action",
      "url": "https://www.loom.com/embed/NEW_VIDEO_ID",
      "duration": "8:45",
      "createdAt": "2024-01-25",
      "featured": false,
      "order": 3
    }
  ]
}
```

### Adding a New Category

1. Add to `categoryOrder`:
```json
"categoryOrder": [
  "introduction",
  "privacy-security", 
  "how-we-work",
  "evaluations",
  "what-were-working-on-next",
  "demos",
  "tutorials"
]
```

2. Add category object:
```json
"tutorials": {
  "title": "Tutorials",
  "description": "Step-by-step guides and tutorials",
  "order": 7,
  "videos": [
    {
      "id": "tutorial-1",
      "title": "Getting Started Tutorial",
      "description": "Learn the basics of using our platform",
      "url": "https://www.loom.com/embed/TUTORIAL_VIDEO_ID",
      "duration": "12:30",
      "createdAt": "2024-01-25",
      "featured": false,
      "order": 1
    }
  ]
}
```

## Where Videos Appear

- **Featured videos** (`featured: true`) appear as buttons on the landing page
- **All videos** appear in the Video Gallery page
- **Categories** are displayed in the order specified in `categoryOrder`
- **Videos within categories** are sorted by their `order` property

## Best Practices

1. **Use descriptive IDs**: Make video IDs meaningful (e.g., "intro-main", "demo-marketing")
2. **Keep titles concise**: Video titles should be clear and under 50 characters
3. **Update metadata**: Always update `lastUpdated` and `totalVideos` in metadata when adding videos
4. **Test URLs**: Make sure Loom embed URLs work before adding them
5. **Consistent ordering**: Use sequential order numbers (1, 2, 3, etc.) within categories
