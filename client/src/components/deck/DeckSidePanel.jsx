/**
 * DeckSidePanel — Report Flow Studio's in-tab side panel shell.
 *
 * Mirrors the pattern used by Data Flow's node palette and Story Flow's
 * control sidebar: a panel that lives INSIDE the deck's own tab (not the
 * app's global activity-bar sidebar), collapsible, with a segmented-control
 * tab switcher (reusing the `.seg`/`.seg-item` classes from Story Flow) for
 * Esquema / Figuras / Imágenes. Es NAVEGACIÓN: dónde estoy en el deck. Las
 * propiedades de lo seleccionado viven en el inspector, a la derecha.
 */
import { LuLayers, LuChartBar, LuImage, LuPanelLeftClose, LuPanelLeftOpen } from 'react-icons/lu';
import SlidesPanel from './panels/SlidesPanel';
import ChartsPanel from './panels/ChartsPanel';
import ImagesPanel from './panels/ImagesPanel';

// Las disposiciones se fueron al inspector: son una propiedad de la lamina
// activa, no un catalogo que se consulta. Aqui queda la navegacion —donde
// estoy— y los dos catalogos que todavia son la unica via de insertar; esos se
// mudan a donde se usan en la fase 3.
const TABS = [
    { key: 'slides', icon: LuLayers, title: 'Esquema' },
    { key: 'charts', icon: LuChartBar, title: 'Figuras' },
    { key: 'images', icon: LuImage, title: 'Imágenes' },
];

const DeckSidePanel = ({
    collapsed,
    onToggleCollapsed,
    activePanel,
    onChangePanel,
    slides,
    activeSlideIndex,
    onNavigateSlide,
    onMoveSlide,
    onDeleteSlide,
    onAddSlide,
    onDuplicateSlide,
    onInsertChart,
    onInsertImage,
}) => {
    if (collapsed) {
        return (
            <div className="deck-side-panel deck-side-panel--collapsed">
                <button className="deck-side-panel-expand" onClick={onToggleCollapsed} title="Show panel">
                    <LuPanelLeftOpen size={16} />
                </button>
            </div>
        );
    }

    return (
        <div className="deck-side-panel">
            <div className="deck-side-panel-header">
                <div className="seg seg--fill">
                    {TABS.map((tab) => {
                        const Icon = tab.icon;
                        return (
                            <button
                                key={tab.key}
                                className={`seg-item${activePanel === tab.key ? ' seg-item--active' : ''}`}
                                onClick={() => onChangePanel(tab.key)}
                                title={tab.title}
                            >
                                <Icon size={14} />
                            </button>
                        );
                    })}
                </div>
                <button className="deck-side-panel-collapse" onClick={onToggleCollapsed} title="Hide panel">
                    <LuPanelLeftClose size={16} strokeWidth={2.2} />
                </button>
            </div>

            <div className="deck-side-panel-body">
                {activePanel === 'slides' && (
                    <SlidesPanel
                        slides={slides}
                        activeSlideIndex={activeSlideIndex}
                        onNavigate={onNavigateSlide}
                        onMove={onMoveSlide}
                        onDelete={onDeleteSlide}
                        onAddSlide={onAddSlide}
                        onDuplicate={onDuplicateSlide}
                    />
                )}
                {activePanel === 'charts' && <ChartsPanel onInsertChart={onInsertChart} />}
                {activePanel === 'images' && <ImagesPanel onInsertImage={onInsertImage} />}
            </div>
        </div>
    );
};

export default DeckSidePanel;
