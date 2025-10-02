# Overview

This is a football betting signal system called "Scout Core Engine v6.0" that provides real-time analysis and betting recommendations for live football matches. The system combines data from multiple sports APIs (SportMonks and FootyStats) with machine learning techniques to generate high-confidence betting signals across various markets like Over/Under, BTTS (Both Teams to Score), Next Goal, Corners, and Cards.

The application features a real-time dashboard for monitoring signals, system performance metrics, and configuration management. It uses WebSocket connections for live updates and includes reinforcement learning algorithms to continuously improve signal accuracy based on past performance.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture
- **Framework**: React with TypeScript using Vite as the build tool
- **UI Library**: Radix UI components with shadcn/ui design system
- **Styling**: Tailwind CSS with CSS variables for theming
- **State Management**: TanStack Query for server state and local React state for UI
- **Real-time Communication**: WebSocket hooks for live data updates
- **Routing**: Wouter for client-side routing

## Backend Architecture
- **Runtime**: Node.js with Express.js server
- **Language**: TypeScript with ES modules
- **API Architecture**: RESTful endpoints with WebSocket support for real-time updates
- **Core Engine**: Single-threaded event loop coordinating multiple data providers and decision engines
- **Data Processing**: Asynchronous processing with rate limiting for external API calls

## Database & Storage
- **Database**: PostgreSQL with Drizzle ORM
- **Schema**: Structured tables for matches, signals, system metrics, RL agent stats, and configuration
- **Connection**: Neon serverless PostgreSQL for cloud deployment
- **Migrations**: Drizzle Kit for schema management

## Core Components

### Data Providers Layer
- **SportMonks Client**: Fetches comprehensive live match data, historical statistics, and betting odds
- **FootyStats Client**: Provides pre-match analysis, trends, and statistical insights
- **Rate Limiting**: Intelligent request throttling to respect API limits (3000/min for SportMonks, 100/min for FootyStats)

### Decision Engine Layer
- **Market Selector**: Analyzes combined data to identify potential betting opportunities across different markets
- **RL Agent**: Reinforcement learning system that evaluates candidate signals and makes final decisions based on historical performance
- **Confidence Scoring**: Multi-factor analysis to determine signal reliability

### Real-time Processing
- **Core Engine**: Central coordinator that orchestrates data collection, analysis, and signal generation
- **WebSocket Broadcasting**: Live updates to connected clients for signals, metrics, and system status
- **Configurable Updates**: Adjustable polling intervals and processing parameters

## Authentication & Security
- Currently designed for internal use without user authentication
- API key management for external service integration
- Environment-based configuration for sensitive data

## Configuration Management
- Database-stored settings for markets, system parameters, and supported leagues
- Runtime configuration updates without service restart
- Granular control over signal generation thresholds and market preferences

# External Dependencies

## Sports Data APIs
- **SportMonks Advanced API**: Primary data source for live match events, statistics, historical data, and betting odds
- **FootyStats API**: Secondary source for pre-match analysis, team trends, and statistical insights

## Database Services
- **Neon PostgreSQL**: Serverless PostgreSQL database for data persistence
- **Drizzle ORM**: Type-safe database operations and schema management

## Development & Deployment
- **Vite**: Frontend build tool and development server
- **esbuild**: Backend bundling for production builds
- **Replit Platform**: Development environment with specialized plugins for runtime error handling and development tools

## UI & Component Libraries
- **Radix UI**: Headless UI components for accessibility and functionality
- **Tailwind CSS**: Utility-first CSS framework for styling
- **Lucide React**: Icon library for consistent iconography
- **TanStack Query**: Data fetching, caching, and synchronization
- **date-fns**: Date manipulation and formatting utilities

## Machine Learning & Analytics
- **Custom RL Implementation**: Reinforcement learning algorithms for signal optimization
- **Statistical Analysis**: Custom algorithms for market analysis and confidence scoring
- **Performance Tracking**: Historical analysis and backtesting capabilities

# Known Limitations

## Oddsless Production Mode (Current Configuration)

The system is currently configured to operate without live betting odds data. This configuration is designed for production deployment without requiring an odds data add-on from SportMonks.

**Configuration:**
- `REQUIRE_ODDS=0`: System generates signals without requiring odds data
- `MIN_ODDS_FILTER_DISABLED=1`: Minimum odds filtering is disabled
- `ODDS_HYDRATION_ENABLED=0`: Live odds fetching is disabled

**Impact:**
- Signals are generated based on match statistics (SportMonks) and historical data (FootyStats)
- No minimum odds filtering is applied to signals
- Value bet detection is not active (requires real odds data)
- Odds and value bet indicators are not displayed in the UI

**Future Enhancement (Track 2):**
When SportMonks odds data becomes available (requires In-Play Odds add-on):
1. Enable odds in SportMonks panel: In-Play Odds + Bookmaker providers
2. Update configuration: `REQUIRE_ODDS=1`, `MIN_ODDS_FILTER_DISABLED=0`, `ODDS_HYDRATION_ENABLED=1`
3. Restart the application
4. System will automatically activate:
   - Live odds fetching from `/odds/live` endpoint
   - Minimum odds filtering per market
   - Value bet detection with configurable margin
   - Odds display in UI with bookmaker information

## Minute Data Feed Issues & Robust Fallback System

SportMonks `/livescores` API frequently returns stuck/repeating minute values (e.g., minute=27 continuously) for live matches. The `/fixtures/inplay` endpoint is not available (422 error) in the current API plan.

**Critical Discovery:** 
- API issue is **stuck minute** (same value repeatedly), not minute=0
- Raw minute remains unchanged while match progresses in real-time
- Without intervention, dashboard freezes and signals stop generating

**Implemented Solution - Minute Override Guard:**

### 1. Multi-Layer Minute Extraction
Sources checked in priority order (sportmonks-adapter.ts):
- `time.minute`, `time.minutes`, `time.current.minute`
- `live.minute`, `periods.minute`, recent `events[].minute`

### 2. Stale Detection System
Tracks when raw minute last **CHANGED** (not just last seen):
- Detects stuck minutes after 120 seconds (`STALE_MINUTE_THRESHOLD_SEC=120`)
- Separate tracking prevents false stale detections

### 3. Minute Override Guard (Core Protection)
When raw minute is stale (unchanged for 120s):
- **Calculates elapsed time** from last minute change
- **Inflates previous minute** by elapsed minutes: `normalized = prev + elapsed`
- **Automatic progression**: Minute 27 stuck + 3 minutes elapsed = displays 30
- **Timestamp preservation**: Only updates when minute actually increases, allowing elapsed time to accumulate

### 4. Cache System Integration
Last minute cache (90s) with smart timestamp handling:
- Cache timestamp only updates when minute **increases**
- Prevents timestamp reset that would break elapsed time accumulation
- Returns inflated minute when raw feed fails (minute=0)

### 5. Broadcast Guard
Forces WebSocket update when minute progresses:
- Tracks last broadcast minute per match
- Triggers forced broadcast on minute increment
- Ensures frontend receives live updates even when API is weak

### 6. Fixture Fallback (Backup Layer)
After stale detection, fetches fresh data:
- Endpoint: `/fixtures/{id}?include=periods;events`
- Controlled by `USE_FIXTURE_FALLBACK=1`
- Attempts to recover real minute from detailed fixture data

**Configuration:**
```env
USE_STARTING_AT_FALLBACK=1
USE_PERIODS_EVENTS_FALLBACK=1
USE_FIXTURE_FALLBACK=1
LAST_MINUTE_CACHE_SEC=90
STALE_MINUTE_THRESHOLD_SEC=120
```

**Verified Behavior:**
- ✅ Detects stuck minute after 120s unchanged
- ✅ Guard activates and inflates minute by elapsed time
- ✅ Dashboard progresses: 27 → 28 → 29 → ... (1 minute increments)
- ✅ Forced broadcast triggers on each minute progression
- ✅ System operational with weak/stuck API feed
- ✅ Timestamp tracking prevents elapsed time reset
- ✅ Signals continue generating with accurate match time

**Example Log Sequence:**
```
Loop 1: raw=27 | stale=false | guard=false | normalized=27 (fresh data)
Loop 2: raw=27 | stale=true  | guard=true  | normalized=27 | elapsed=0min (33s)
Loop 3: raw=27 | stale=true  | guard=true  | normalized=28 | elapsed=1min (63s) ✅
Loop 4: raw=27 | stale=true  | guard=true  | normalized=29 | elapsed=1min (93s) ✅
```