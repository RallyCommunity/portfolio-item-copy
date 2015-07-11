portfolio-item-copy
=========================

## Overview

This app copies a portfolio item and its descendants, including other portfolio items, user stories (including user story hierarchies) and tasks. 

By default, it copies the following fields:
- Name
- Description
- Owner
- Parent
- Tags

If there are required fields, the app will attempt to copy those fields, as well.  If the Release field is required for stories, the app will present the user with a drop-down box for default release to put in as a placeholder for any parent stories that are being copied.  (A parent story cannot have a release, so if it's required, a parent being copied will fail to copy because the story is first created as a standalone and then becomes a parent when a child is assigned to it.)

In addition, the app can be configured to copy additional fields by using Edit App Settings...  

![alt text](https://raw.githubusercontent.com/wrackzone/portfolio-item-copy/master/screenshot.png "Screenshot")


## License

AppTemplate is released under the MIT license.  See the file [LICENSE](./LICENSE) for the full text.

##Documentation for SDK

