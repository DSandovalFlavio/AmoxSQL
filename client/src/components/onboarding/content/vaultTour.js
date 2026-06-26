/**
 * Analysis Vault — first-run tour content.
 * Persistent saved analyses that survive file deletion.
 */
import { LuLibrary, LuTags, LuSearch, LuFolderOpen } from 'react-icons/lu';

export const VAULT_TOUR_STEPS = [
    {
        icon: LuLibrary, title: 'A home for good queries', tagline: 'Nothing gets lost',
        headline: 'Keep the analyses worth keeping',
        desc: 'The Analysis Vault stores queries and analyses that survive even if you delete the file they came from. It is your durable library of work, separate from the project files.',
        points: ['Outlives file edits and deletions', 'Always a query away from reuse'],
    },
    {
        icon: LuTags, title: 'Tag & organize', tagline: 'Findable later',
        headline: 'Label what you save',
        desc: 'Add tags and edit entries inline so a query you wrote months ago is easy to find by topic, not by remembering the filename.',
    },
    {
        icon: LuSearch, title: 'Search', tagline: 'Recall fast',
        headline: 'Find any past analysis',
        desc: 'Full-text search across saved entries gets you back to that one query you know you wrote — in seconds.',
    },
    {
        icon: LuFolderOpen, title: 'Open in editor', tagline: 'Pick up where you left off',
        headline: 'Reuse with one click',
        desc: 'Open any vault entry straight into the editor to run it again or branch a new analysis from it.',
    },
];
