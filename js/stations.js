// HYROX standard station catalogue, in race order. Weights are Open division (women / men);
// always double-check the current official rulebook for your division.
export const STATIONS = {
  skierg: {
    name: 'SkiErg', spec: '1,000 m',
    detail: 'Pull the handles down to the hips; the monitor counts metres. Damper is your choice.',
  },
  sledpush: {
    name: 'Sled Push', spec: '50 m (4 × 12.5 m)', weight: '102 kg / 152 kg incl. sled',
    detail: 'Push the sled the full lane length, turn around behind it, push back. Four lengths.',
  },
  sledpull: {
    name: 'Sled Pull', spec: '50 m (4 × 12.5 m)', weight: '78 kg / 103 kg incl. sled',
    detail: 'Stay behind the line of your athlete box and pull the rope hand over hand; walk to the other end after each length.',
  },
  burpees: {
    name: 'Burpee Broad Jumps', spec: '80 m',
    detail: 'Chest to the floor, then jump forward with both feet. Lane goes down and back.',
  },
  row: {
    name: 'Rowing', spec: '1,000 m',
    detail: 'Take any free rower; the monitor counts metres.',
  },
  farmers: {
    name: 'Farmers Carry', spec: '200 m', weight: '2 × 16 kg / 2 × 24 kg',
    detail: 'Pick up the kettlebells and carry them along the lane. Put them down whenever you need to.',
  },
  lunges: {
    name: 'Sandbag Lunges', spec: '100 m', weight: '10 kg / 20 kg',
    detail: 'Sandbag on the shoulders, back knee touches the floor each rep.',
  },
  wallballs: {
    name: 'Wall Balls', spec: '100 reps', weight: '4 kg to 2.70 m / 6 kg to 3.00 m',
    detail: 'Full squat, throw the ball to hit the target. The judge counts no-reps.',
  },
};

export const STATION_ORDER = ['skierg', 'sledpush', 'sledpull', 'burpees', 'row', 'farmers', 'lunges', 'wallballs'];
