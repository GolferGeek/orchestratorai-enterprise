import { useState } from 'react';
import { useSharedTimer } from '@/hooks/useSharedTimer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Play, Pause, RotateCcw, Coffee, Brain, Settings } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

interface TimerProps {
  onFocusComplete?: () => void;
  teamId?: string | null;
}

export function Timer({ onFocusComplete, teamId }: TimerProps) {
  const {
    timeLeft,
    isRunning,
    isBreak,
    loading,
    focusMinutes,
    breakMinutes,
    autoContinue,
    setAutoContinue,
    setCustomDurations,
    handleStart,
    handlePause,
    handleReset,
    toggleBreak,
  } = useSharedTimer(onFocusComplete, teamId);

  const [tempFocus, setTempFocus] = useState(focusMinutes);
  const [tempBreak, setTempBreak] = useState(breakMinutes);

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;

  const formatTime = (num: number) => num.toString().padStart(2, '0');

  const handleSaveSettings = () => {
    setCustomDurations(tempFocus, tempBreak);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center">
        <div className="w-72 h-72 rounded-full bg-card animate-pulse" />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-8 fade-in">
      {/* Mode Toggle + Settings */}
      <div className="flex items-center gap-4">
        <div className="flex gap-2">
          <Button
            variant={!isBreak ? 'default' : 'secondary'}
            onClick={toggleBreak}
            disabled={isRunning}
            className="gap-2"
          >
            <Brain className="w-4 h-4" />
            Focus
          </Button>
          <Button
            variant={isBreak ? 'default' : 'secondary'}
            onClick={toggleBreak}
            disabled={isRunning}
            className="gap-2"
          >
            <Coffee className="w-4 h-4" />
            Break
          </Button>
        </div>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="h-9 w-9">
              <Settings className="w-4 h-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72" align="end">
            <div className="space-y-4">
              <h4 className="font-medium text-sm">Timer Settings</h4>
              
              <div className="space-y-2">
                <Label htmlFor="focus-duration">Focus Duration (minutes)</Label>
                <Input
                  id="focus-duration"
                  type="number"
                  min={1}
                  max={120}
                  value={tempFocus}
                  onChange={(e) => setTempFocus(Number(e.target.value))}
                  disabled={isRunning}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="break-duration">Break Duration (minutes)</Label>
                <Input
                  id="break-duration"
                  type="number"
                  min={1}
                  max={60}
                  value={tempBreak}
                  onChange={(e) => setTempBreak(Number(e.target.value))}
                  disabled={isRunning}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="auto-continue" className="text-sm">
                  Auto-continue
                </Label>
                <Switch
                  id="auto-continue"
                  checked={autoContinue}
                  onCheckedChange={setAutoContinue}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Automatically switch between focus and break
              </p>

              <Button 
                onClick={handleSaveSettings} 
                disabled={isRunning}
                className="w-full"
                size="sm"
              >
                Save Settings
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Timer Display */}
      <div
        className={`relative w-72 h-72 sm:w-80 sm:h-80 rounded-full bg-card flex items-center justify-center transition-all duration-500 ${
          isRunning
            ? isBreak
              ? 'timer-glow-break'
              : 'timer-glow'
            : ''
        }`}
      >
        {/* Progress ring */}
        <svg
          className="absolute inset-0 w-full h-full -rotate-90"
          viewBox="0 0 100 100"
        >
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            stroke="hsl(var(--border))"
            strokeWidth="2"
          />
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            stroke={isBreak ? 'hsl(var(--accent))' : 'hsl(var(--primary))'}
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={`${2 * Math.PI * 45}`}
            strokeDashoffset={`${
              2 * Math.PI * 45 * (1 - timeLeft / ((isBreak ? breakMinutes : focusMinutes) * 60))
            }`}
            className="transition-all duration-200"
          />
        </svg>

        {/* Time display */}
        <div className="relative z-10 text-center">
          <span className="font-mono text-6xl sm:text-7xl font-semibold tracking-tight">
            {formatTime(minutes)}:{formatTime(seconds)}
          </span>
          <p className="text-muted-foreground text-sm mt-2">
            {isBreak ? 'Break Time' : 'Focus Time'}
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex gap-3">
        {!isRunning ? (
          <Button
            size="lg"
            onClick={handleStart}
            className="gap-2 px-8 h-12 text-lg"
          >
            <Play className="w-5 h-5" />
            Start
          </Button>
        ) : (
          <Button
            size="lg"
            variant="secondary"
            onClick={handlePause}
            className="gap-2 px-8 h-12 text-lg"
          >
            <Pause className="w-5 h-5" />
            Pause
          </Button>
        )}
        <Button
          size="lg"
          variant="outline"
          onClick={handleReset}
          className="gap-2 h-12"
        >
          <RotateCcw className="w-5 h-5" />
          Reset
        </Button>
      </div>

      {/* Status indicators */}
      <div className="flex flex-col items-center gap-1 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          Synced with team
        </div>
        {autoContinue && (
          <span className="text-primary/70">Auto-continue enabled</span>
        )}
      </div>
    </div>
  );
}
