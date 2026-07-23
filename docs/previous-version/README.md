## Dialogue system
### Problems to resolve
- Some dialogue options may be generic and common to many NPCs ("Let's trade", "Heard any news?", ...)
- Some other options may be specific to some NPCs
- Some options may be available only if some conditions are met ro not met (eg. if the player is in a specific room, or if the player is in a specific state)
- Some other options may be available on a specific quest status
- Other options may be available basing on player stats
- Some options may appear only when a dice roll is successful
- ...

### Components needed:
An example of structure: https://excalidraw.com/#json=2qrwDJKS9R7i-0QqdE9cA,Vhm1ncjb6xFmd05KqrgU1Q
- An inventory of each dialog, organized like a tree. Should contain trees appliable to any NPC, just come classes/factions and specific NPCs
- A component to store the dialogs status (eg. if the player has already spoken about some argument, or if the player has already done some peculiar action). This will need to be saved.
- A component to display the dialogs
- A dialogs manager, to operate on the dialogs, change and query the state, ...


## Quest system
### Components needed
- An inventory of all possible quests (with rules to change the status)
- A current status manager for the quests: for each started quest, its status (this will need to be saved)
- A component to display each quest log and status
- A quest manager, to operate on the quests, change or query the state, interact with player and NPSs...

## NPCs AI
NPCs AI is modeled, for now, with a finite state automata.


### Available states
- idle: standing, waiting for something to happen
- fight_player: fighting the player
- chase_player: chasing the player until at fighting range
- flee_player: fleeing from the player
- talk: talking to the player
- wandering: wandering around initial position, without any goal
- patrolling: patrolling between two points


Some NPCs can only be in a subset of all these states.

Each NPC has a structure containing:
- its available states
- its current state
- a list of variables and flags (eg. if the NPC has already spoken about some argument, or if the player has already done some peculiar action)

### States transition
Each state can transition to a subset of available states (eg. flee_player will never transition to idle or talk).
### Nice to have:
- The transition between states may have a priority value, so in case of multiple possibilities, the NPC will choose the one with the highest priority.
- This priority can be modified by some NPC values, such as aggressivity (a deer always tries to flee), etc..

