import { resourceLabel, type ResourceId } from '../data/resources';
import { cx } from '../lib/cx';
import './ResourceChip.css';

type Props = {
  resource: ResourceId;
  inherited?: boolean;
  className?: string;
};

const ResourceChip = ({ resource, inherited, className }: Props) => (
  <span
    className={cx('resource-chip', `resource-chip--${resource}`, inherited && 'resource-chip--inherited', className)}
    title={inherited ? `${resourceLabel(resource)} (del campeón)` : resourceLabel(resource)}
  >
    {resourceLabel(resource)}
  </span>
);

export default ResourceChip;
